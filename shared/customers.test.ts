import { describe, expect, it } from 'vitest'
import { cleanDate, cleanPhone, customerName, decodeCsv, mapHeadings, matchesSearch, parseCsv, readCustomersCsv, withoutDuplicates } from './customers'
import type { Customer } from './types'

const person = (p: Partial<Customer> = {}): Customer => ({
  id: 'c1', kind: 'lead', first_name: 'Lucía', last_name: 'García', email: 'lucia@example.com', phone: '+34 600 111 222', company: null,
  source: 'instagram', instagram: null, birthday: null, tags: ['oat milk'], notes: 'Comes in on Fridays', marketing_consent: false,
  consent_at: null, last_contacted_at: null, created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z', ...p,
})

describe('reading a CSV', () => {
  it('takes commas, or semicolons from Spanish Excel, with quotes, line breaks and a byte-order mark', () => {
    expect(parseCsv('Name,Email\r\n"García, Lucía",lucia@example.com\r\n')).toEqual([['Name', 'Email'], ['García, Lucía', 'lucia@example.com']])
    expect(parseCsv('﻿Nombre;Correo;Notas\n"Ana";ana@example.com;"Dice ""hola""\nsiempre"\n;;\n'))
      .toEqual([['Nombre', 'Correo', 'Notas'], ['Ana', 'ana@example.com', 'Dice "hola"\nsiempre']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('reads files saved by Excel on a Spanish PC (Windows-1252) as well as UTF-8', () => {
    expect(decodeCsv(new TextEncoder().encode('Teléfono;Móvil'))).toBe('Teléfono;Móvil')
    expect(decodeCsv(new Uint8Array([0x54, 0x65, 0x6c, 0xe9, 0x66, 0x6f, 0x6e, 0x6f]))).toBe('Teléfono')
  })

  it('recognises headings in English and Spanish, accents and case aside', () => {
    expect(mapHeadings(['Nombre', 'Apellidos', 'Correo electrónico', 'Teléfono', 'Empresa', 'Notas', 'Something else']))
      .toEqual(['first_name', 'last_name', 'email', 'phone', 'company', 'notes', null])
    expect(mapHeadings(['First Name', 'Last name', 'E-mail', 'Mobile', 'Company', 'Tags', 'Marketing'])).toEqual(
      ['first_name', 'last_name', 'email', 'phone', 'company', 'tags', 'consent'])
    // Only the first column of a kind counts.
    expect(mapHeadings(['Email', 'Mail'])).toEqual(['email', null])
  })

  it('turns rows into customers, tidying phones, emails, dates and consent', () => {
    const csv = [
      'Nombre;Apellidos;Correo;Móvil;Empresa;Cumpleaños;Etiquetas;Acepta marketing',
      'Lucía;García López;Lucia@Example.com;600111222;;14/05/1990;vip, oat milk;sí',
      'Hotel;;concierge@hotel.test;0044 7700 900123;Hotel Puente Romano;;;no',
      ';;not-an-email;12;;;;',
      'Pepe;;;;;31/02/1990;;',
    ].join('\n')
    const { rows, skipped, columns } = readCustomersCsv(csv)
    expect(skipped).toBe(1)
    expect(columns.map(c => c.field)).toEqual(['first_name', 'last_name', 'email', 'phone', 'company', 'birthday', 'tags', 'consent'])
    expect(rows[0]).toMatchObject({ first_name: 'Lucía', last_name: 'García López', email: 'lucia@example.com', phone: '+34 600 111 222',
      birthday: '1990-05-14', tags: ['vip', 'oat milk'], marketing_consent: true, company: null })
    expect(rows[1]).toMatchObject({ first_name: 'Hotel', phone: '+44 7700 900123', company: 'Hotel Puente Romano', marketing_consent: false })
    expect(rows[2]).toMatchObject({ first_name: 'Pepe', birthday: null, email: null })
  })

  it('splits a single name column into first name and surnames', () => {
    expect(readCustomersCsv('Name,Phone\nLucía García López,+34 600 111 222').rows[0])
      .toMatchObject({ first_name: 'Lucía', last_name: 'García López', phone: '+34 600 111 222' })
    expect(readCustomersCsv('Nombre;Teléfono\nAna Ruiz;611 222 333').rows[0]).toMatchObject({ first_name: 'Ana', last_name: 'Ruiz', phone: '+34 611 222 333' })
  })

  it('leaves out people already on the list, and repeats in the file', () => {
    const { rows } = readCustomersCsv('Email,Phone\nlucia@example.com,\nnew@example.com,\nNEW@example.com,\n,600 111 222\n,+34 699 000 000')
    const { fresh, duplicates } = withoutDuplicates(rows, [person()])
    expect(fresh.map(r => r.email ?? r.phone)).toEqual(['new@example.com', '+34 699 000 000'])
    expect(duplicates).toBe(3)
  })
})

describe('customers', () => {
  it('cleans phone numbers to "+34 600 000 000"', () => {
    expect(cleanPhone('600-111-222')).toBe('+34 600 111 222')
    expect(cleanPhone('+34600111222')).toBe('+34 600 111 222')
    expect(cleanPhone('34 600 111 222')).toBe('+34 600 111 222')
    expect(cleanPhone('+44 (0) 7700 900123')).toBe('+44 7700 900123')
    expect(cleanPhone('12345')).toBeNull()
    expect(cleanPhone('6001112223')).toBeNull()
  })

  it('reads dates day first, as in Spain', () => {
    expect(cleanDate('1990-5-4')).toBe('1990-05-04')
    expect(cleanDate('04.05.1990')).toBe('1990-05-04')
    expect(cleanDate('31/04/1990')).toBeNull()
    expect(cleanDate('May 4')).toBeNull()
  })

  it('names people by their name, else the company, email or phone', () => {
    expect(customerName(person())).toBe('Lucía García')
    expect(customerName(person({ first_name: null, last_name: null, company: 'Hotel Puente Romano' }))).toBe('Hotel Puente Romano')
    expect(customerName(person({ first_name: null, last_name: null }))).toBe('lucia@example.com')
  })

  it('searches names, email, phone, company, notes and tags, accents aside', () => {
    expect(matchesSearch(person(), 'lucia garcia')).toBe(true)
    expect(matchesSearch(person(), 'OAT')).toBe(true)
    expect(matchesSearch(person(), 'fridays')).toBe(true)
    expect(matchesSearch(person(), '600111')).toBe(true)
    expect(matchesSearch(person(), '600 111')).toBe(true)
    expect(matchesSearch(person(), 'hotel')).toBe(false)
    expect(matchesSearch(person(), '  ')).toBe(true)
  })
})
