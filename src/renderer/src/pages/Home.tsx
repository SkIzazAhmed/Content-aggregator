import { useEffect, useState, useCallback } from 'react'
import { SearchBar } from '../components/SearchBar'
import { CategoryToggle } from '../components/CategoryToggle'
import { FeedView } from '../components/FeedView'
import type { ArticleWithMeta, Category, SearchParams } from '../types'

type SortBy = 'date' | 'relevance' | 'source'

export function Home() {
  const [articles, setArticles] = useState<ArticleWithMeta[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [isLoading, setIsLoading] = useState(false)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  const load = useCallback(async () => {
    setIsLoading(true)
    const params: SearchParams = {
      query: query.trim() || undefined,
      category_id: selectedCategory ?? undefined,
      sort_by: sortBy,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }
    const result = query.trim()
      ? await window.api.articles.search(params)
      : await window.api.articles.getFeed(params)
    setArticles(result)
    setIsLoading(false)
  }, [query, selectedCategory, sortBy, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { window.api.categories.list().then(setCategories) }, [])

  function handleQueryChange(q: string) {
    if (q.trim() && sortBy === 'source') setSortBy('date')
    setQuery(q)
    setPage(0)
  }

  function handleCategorySelect(id: number | null) { setSelectedCategory(id); setPage(0) }

  const queryActive = query.trim().length > 0

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
      <SearchBar value={query} onChange={handleQueryChange} />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <CategoryToggle
          categories={categories}
          selectedId={selectedCategory}
          onSelect={handleCategorySelect}
        />
        <select
          className="text-xs border rounded px-2 py-1"
          value={sortBy}
          onChange={e => { setSortBy(e.target.value as SortBy); setPage(0) }}
        >
          <option value="date">Sort: Newest</option>
          <option value="relevance">Sort: Relevance</option>
          <option value="source" disabled={queryActive}>Sort: Source</option>
        </select>
      </div>
      <FeedView articles={articles} isLoading={isLoading} />
      {articles.length === PAGE_SIZE && (
        <button
          onClick={() => setPage(p => p + 1)}
          className="text-sm text-blue-600 hover:underline text-center"
        >
          Load more
        </button>
      )}
    </div>
  )
}
