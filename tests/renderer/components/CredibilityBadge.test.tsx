import { render, screen } from '@testing-library/react'
import { CredibilityBadge } from '../../../src/renderer/src/components/CredibilityBadge'

it('score 0.90 → green "Trusted" badge', () => {
  render(<CredibilityBadge credibility={{ score: 0.90, tier: 1, flags: [], explanation: 'trusted' }} />)
  const badge = screen.getByText('Trusted')
  expect(badge).toBeInTheDocument()
  expect(badge.className).toMatch(/green/)
})

it('score 0.55 → yellow "Unverified" badge', () => {
  render(<CredibilityBadge credibility={{ score: 0.55, tier: 2, flags: ['unconfirmed_tier'], explanation: 'unverified' }} />)
  const badge = screen.getByText('Unverified')
  expect(badge).toBeInTheDocument()
  expect(badge.className).toMatch(/yellow/)
})

it('score 0.10 → red "Flagged" badge', () => {
  render(<CredibilityBadge credibility={{ score: 0.10, tier: 3, flags: ['flagged_source'], explanation: 'flagged' }} />)
  const badge = screen.getByText('Flagged')
  expect(badge).toBeInTheDocument()
  expect(badge.className).toMatch(/red/)
})

it('undefined credibility → renders nothing', () => {
  const { container } = render(<CredibilityBadge credibility={undefined} />)
  expect(container).toBeEmptyDOMElement()
})
