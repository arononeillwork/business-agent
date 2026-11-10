// The error screen (ErrorBoundary.tsx): what something that breaks shows instead of a blank page.
// Server rendering doesn't run error boundaries, so the boundary is taken through what React does when a
// child throws: getDerivedStateFromError, componentDidCatch, then render.
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary, ErrorScreen } from './ErrorBoundary'

describe('the error screen', () => {
  it('says something went wrong, with Reload and how to reach The Business Agent', () => {
    const html = renderToStaticMarkup(createElement(ErrorScreen))
    expect(html).toContain('Something went wrong')
    expect(html).toContain('We’ve been told about it')
    expect(html).toMatch(/<button[^>]*>Reload<\/button>/)
    expect(html).toContain('href="mailto:thebusinesssagent@gmail.com"')
  })

  it('shows what’s inside while nothing has broken', () => {
    expect(renderToStaticMarkup(createElement(AppErrorBoundary, { report: vi.fn(), children: createElement('p', null, 'The rota') }))).toBe('<p>The rota</p>')
  })

  it('in place of what broke, and reports it', () => {
    const report = vi.fn()
    const boundary = new AppErrorBoundary({ children: createElement('p', null, 'The rota'), report })
    const boom = new TypeError('Cannot read properties of undefined (reading \'starts_at\')')
    boundary.state = AppErrorBoundary.getDerivedStateFromError()
    boundary.componentDidCatch(boom)
    expect(report).toHaveBeenCalledWith(boom, 'render')
    const html = renderToStaticMarkup(boundary.render() as ReactElement)
    expect(html).toContain('Something went wrong')
    expect(html).toContain('Reload')
    expect(html).not.toContain('The rota')
  })

  it('tries again when another page is opened', () => {
    const boundary = new AppErrorBoundary({ children: null, inPage: true, resetKey: '/rota', report: vi.fn() })
    boundary.state = AppErrorBoundary.getDerivedStateFromError()
    const setState = vi.spyOn(boundary, 'setState').mockImplementation(() => {})
    boundary.componentDidUpdate({ children: null, resetKey: '/rota' })
    expect(setState).not.toHaveBeenCalled()
    boundary.componentDidUpdate({ children: null, resetKey: '/timecards' })
    expect(setState).toHaveBeenCalledWith({ failed: false })
  })
})
