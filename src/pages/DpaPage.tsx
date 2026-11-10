import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { H, LegalPage, Mail, P, Processors, Ul, operatorLine } from '../components/legal'
import { t, tr } from '../i18n'

// The public data processing agreement (GDPR article 28; in Spain the "contrato de encargado del
// tratamiento"). The business is the controller of its team's, customers' and contacts' data and The
// Business Agent its processor. Part of the terms of service, accepted when an owner creates the
// business (NewBusinessPage). The sub-processors are the privacy policy's own list (Processors).

export function DpaPage() {
  const L = LEGAL
  const service = L.service
  const mail = <Mail to={L.contactEmail} />
  const terms = <Link component={RouterLink} to="/terms">{t('terms of service')}</Link>
  const privacy = <Link component={RouterLink} to="/privacy">{t('privacy policy')}</Link>
  const label = (text: string) => <b>{text}</b>
  return (
    <LegalPage title={t('Data processing agreement')} updated={L.dpaUpdated}>
      <P>
        {tr('This agreement is part of the {terms}. It applies whenever we process personal data on a business’s behalf in {service}: the business is the data controller, and decides why and how its data is processed; {operator} (“we”, “us”) is its data processor, under article 28 of the GDPR (the EU’s General Data Protection Regulation) and Spain’s Organic Law 3/2018. The business accepts it when an owner creates the business in {service}, or by using the service.', {
          terms, service, operator: operatorLine(),
        })}
      </P>
      <P>
        {tr('For the account details of the people who sign up, and for billing, we are the controller ourselves; the {privacy} covers that.', { privacy })}
      </P>

      <H>{t('1. What the processing is')}</H>
      <Ul items={[
        tr('{label} providing {service} to the business: the rota, clock-ins and the working-hours record, time off, the calendar, customers and contacts, finances, messages, and the apps the business connects.', { label: label(t('Subject matter:')), service }),
        tr('{label} as long as the business has an account, and then until its data is deleted as section 10 says.', { label: label(t('Duration:')) }),
        tr('{label} storing, organising, showing, sending, exporting and deleting data, in an online app hosted for the business. Some steps are automatic, such as clocking people out at the end of a shift, reminders, and filling in each night’s timecards from the rota.', { label: label(t('Nature:')) }),
        tr('{label} only to provide the service the business uses, keep it secure and working, and give support when the business asks for it. The data is never used for advertising, never sold, and never used to train AI models.', { label: label(t('Purpose:')) }),
      ]} />

      <H>{t('2. The data and the people it is about')}</H>
      <Ul items={[
        tr('{label} the team members the business adds (employees, admins, partners and anyone else it invites); the customers and contacts it adds or brings in from connected apps (customers, suppliers, leads, job applicants); and anyone else whose details the business chooses to keep in {service}.', { label: label(t('Who it is about:')), service }),
        tr('{label} names, contact details and roles; employment contracts; shifts, clock-ins and clock-outs, breaks, time off and corrections to timecards; pay rates; customers’ and contacts’ details, their purchases and loyalty from connected tills, and notes; CVs and notes on applicants; photos, posts, documents, messages and emails; and sign-in and activity records.', { label: label(t('Types of data:')) }),
      ]} />
      <P>
        {t('{service} is not designed for special categories of data, such as health. Where the business records any, for example the reason for a sick day, it does so only as the law allows, and keeps it to what is needed.', { service })}
      </P>

      <H>{t('3. Only on the business’s instructions')}</H>
      <P>
        {t('We process the data only on the business’s documented instructions: the terms of service and this agreement, and what its admins set up and do in {service}, including the apps they connect and what the people it invites ask an AI assistant to do. We do not use the data for our own purposes. If the law requires us to process it in some other way, we tell the business first, unless the law forbids that. If we believe an instruction breaks data-protection law, we tell the business straight away.', { service })}
      </P>

      <H>{t('4. Confidentiality')}</H>
      <P>
        {t('Everyone who works for us and can reach the data is bound to keep it confidential, and reaches it only when needed: to give support the business asked for, to keep the service secure, or because the law requires it. That duty continues after they stop working for us.')}
      </P>

      <H>{t('5. Security (article 32)')}</H>
      <P>{t('We keep technical and organisational measures suited to the risk, and review them as the service changes. Today they include:')}</P>
      <Ul items={[
        t('encryption in transit and at rest, with the tokens for connected apps encrypted again by the app;'),
        t('access rules in the database, so each business sees only its own data and each person only what their role allows;'),
        t('passwords kept only as a one-way hash, and access keys for AI assistants kept only as a hash;'),
        t('a log of every change to a timecard, with who made it and why;'),
        t('data hosted in the European Union, with providers that hold their own security certifications;'),
        t('access to the live systems only for the few people who need it.'),
      ]} />

      <H>{t('6. Sub-processors')}</H>
      <P>
        {t('The business gives us general authorisation to use other providers (sub-processors) to run the service. Today they are the same ones the privacy policy lists:')}
      </P>
      <Processors />
      <P>
        {t('The apps a business connects receive data only once it connects them and asks for something, such as publishing a post or sending a message; their own terms apply to the business too.')}
      </P>
      <P>
        {tr('Each sub-processor is bound by a written contract with the same data-protection duties as this agreement, and we remain responsible to the business for what they do. Before we add or replace one, we update this list and tell account owners by email at least 30 days ahead. The business can object on reasonable data-protection grounds by writing to {mail}; if we cannot meet the objection, it can close its account (the terms of service say how).', { mail })}
      </P>

      <H>{t('7. Transfers outside the European Economic Area')}</H>
      <P>
        {t('The database is in the European Union (Ireland). Where a sub-processor handles data outside the European Economic Area, the transfer is covered by the European Commission’s standard contractual clauses or an adequacy decision (such as the EU-US Data Privacy Framework), with extra safeguards where they are needed.')}
      </P>

      <H>{t('8. Helping the business')}</H>
      <Ul items={[
        tr('{label} admins can see, correct, export and delete the data in {service} themselves. If someone writes to us instead, we pass the request on to the business without undue delay, and do not answer it ourselves unless the business asks us to.', { label: label(t('People’s requests about their data:')), service }),
        tr('{label} we help the business with security, with notifying breaches, and with data protection impact assessments and any prior consultation of the authority, with the information we have about the service.', { label: label(t('Articles 32 to 36:')) }),
      ]} />

      <H>{t('9. Personal data breaches')}</H>
      <P>
        {t('If we become aware of a breach of personal data in {service}, we tell the business’s account owners by email without undue delay, so that it can meet its own 72-hour deadline to notify the authority. We say what happened, which data and people it affects as far as we know, the likely consequences, and what we have done or propose to do, and add more as we learn it.', { service })}
      </P>

      <H>{t('10. At the end: deletion or return')}</H>
      <P>
        {t('At any time, and before closing its account, an owner can download all of the business’s data as CSV files from the Billing page: that is how the data is returned. An account closes 30 days after an owner asks. Once it has closed, we delete the business’s data within 30 days, except the working-hours record (registro de jornada), which we keep for four years, as Spanish law requires, and then delete.')}
      </P>
      <P>
        {tr('During those four years the business can still ask us for a copy at {mail}. When a person is removed from the team, we delete or anonymise their data within 30 days, except their working-hours records.', { mail })}
      </P>

      <H>{t('11. Information and audits')}</H>
      <P>
        {tr('On request, we give the business the information it needs to show that this agreement is kept, such as a description of our security measures and our sub-processors’ certifications. The business, or an independent auditor it chooses who is bound to confidentiality, can audit how we keep it: ask at {mail} at least 30 days ahead. We first answer written questions; audits are at most once a year (unless after a breach, or an authority asks), in working hours, at the business’s cost, and without access to other businesses’ data.', { mail })}
      </P>

      <H>{t('12. Liability, law and changes')}</H>
      <P>
        {t('The limits on liability in the terms of service apply to this agreement too, as far as the law allows. If this agreement and the terms differ on personal data, this agreement applies. It is governed by Spanish law, and disputes go to the courts the terms name. We change it the way the terms say: the date above changes and, for important changes, account owners hear by email at least 30 days ahead.')}
      </P>

      <H>{t('13. Contact')}</H>
      <P>{tr('About this agreement or the business’s data, or for a signed copy: {mail}.', { mail })}</P>
    </LegalPage>
  )
}
