import { ArticleCard } from './ArticleCard'
import type { ArticleWithMeta } from '../types'

interface Props { articles: ArticleWithMeta[]; isLoading: boolean }

export function FeedView({ articles, isLoading }: Props) {
  if (isLoading) return <p className="text-center text-gray-400 py-8">Loading…</p>
  if (articles.length === 0) return (
    <p className="text-center text-gray-400 py-8">
      No articles yet. Add sources in Settings and click &ldquo;Fetch Now&rdquo;.
    </p>
  )
  return (
    <div className="flex flex-col gap-3">
      {articles.map(a => <ArticleCard key={a.id} article={a} />)}
    </div>
  )
}
