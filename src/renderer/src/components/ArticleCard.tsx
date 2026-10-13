import type { ArticleWithMeta } from '../types'

interface Props { article: ArticleWithMeta }

export function ArticleCard({ article }: Props) {
  const date = new Date(article.published_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  })

  return (
    <article className="border rounded-lg p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow">
      <a href={article.url} target="_blank" rel="noopener noreferrer"
         className="font-semibold text-blue-700 hover:underline leading-tight">
        {article.title}
      </a>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>{article.source_name}</span>
        <span>·</span>
        <span>{date}</span>
        {article.author && <><span>·</span><span>{article.author}</span></>}
      </div>
      {article.categories.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1">
          {article.categories.map(c => (
            <span key={c.id}
              className="text-xs rounded-full px-2 py-0.5 font-medium"
              style={{ background: c.color + '20', color: c.color }}
            >
              {c.name}
            </span>
          ))}
        </div>
      )}
      {article.body_text && (
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{article.body_text}</p>
      )}
    </article>
  )
}
