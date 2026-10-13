import { render, screen } from '@testing-library/react'
import { ArticleCard } from '../../../src/renderer/src/components/ArticleCard'
import type { ArticleWithMeta } from '../../../src/renderer/src/types'

const article: ArticleWithMeta = {
  id: 1, source_id: 1, url: 'https://example.com/post',
  title: 'Test Article Title', body_text: 'Some content',
  author: 'Jane Doe', published_at: '2026-01-15T10:00:00Z',
  fetched_at: '2026-01-15T10:01:00Z', url_hash: 'abc',
  source_name: 'Example Blog', source_trust_tier: 1,
  categories: [{ id: 1, name: 'Tech', color: '#3b82f6', confidence: 1 }],
}

it('renders article title and source name', () => {
  render(<ArticleCard article={article} />)
  expect(screen.getByText('Test Article Title')).toBeInTheDocument()
  expect(screen.getByText('Example Blog')).toBeInTheDocument()
})

it('renders category badge', () => {
  render(<ArticleCard article={article} />)
  expect(screen.getByText('Tech')).toBeInTheDocument()
})

it('renders a link to the article URL', () => {
  render(<ArticleCard article={article} />)
  const link = screen.getByRole('link', { name: /Test Article Title/i })
  expect(link).toHaveAttribute('href', 'https://example.com/post')
})
