import { useEffect, useState } from 'react'
import { SourceForm } from '../components/SourceForm'
import type { Source, Category } from '../types'

interface CategoryKeyword { id: number; category_id: number; keyword: string }

export function Settings() {
  const [sources, setSources] = useState<Source[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#3b82f6')
  const [isFetching, setIsFetching] = useState(false)
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null)
  const [keywords, setKeywords] = useState<CategoryKeyword[]>([])
  const [newKeyword, setNewKeyword] = useState('')

  async function loadSources() { setSources(await window.api.sources.list()) }
  async function loadCategories() { setCategories(await window.api.categories.list()) }

  useEffect(() => { loadSources(); loadCategories() }, [])

  async function handleAddSource(data: Parameters<typeof window.api.sources.create>[0]) {
    await window.api.sources.create(data)
    loadSources()
  }

  async function handleToggleSource(s: Source) {
    await window.api.sources.update(s.id, { active: s.active === 1 ? 0 : 1 })
    loadSources()
  }

  async function handleDeleteSource(id: number) {
    await window.api.sources.delete(id)
    loadSources()
  }

  async function handleTierChange(id: number, tier: number) {
    await window.api.sources.update(id, { trust_tier: tier as 1 | 2 | 3 })
    loadSources()
  }

  async function handleFetchNow() {
    setIsFetching(true)
    await window.api.sources.fetchNow()
    setIsFetching(false)
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    await window.api.categories.create({ name: newCatName.trim(), color: newCatColor })
    setNewCatName('')
    loadCategories()
  }

  async function handleDeleteCategory(id: number) {
    await window.api.categories.delete(id)
    if (expandedCatId === id) setExpandedCatId(null)
    loadCategories()
  }

  async function handleExpandCategory(catId: number) {
    if (expandedCatId === catId) {
      setExpandedCatId(null)
      return
    }
    setExpandedCatId(catId)
    setNewKeyword('')
    setKeywords(await window.api.categories.listKeywords(catId))
  }

  async function handleRemoveKeyword(keywordId: number) {
    await window.api.categories.removeKeyword(keywordId)
    if (expandedCatId !== null) {
      setKeywords(await window.api.categories.listKeywords(expandedCatId))
    }
  }

  async function handleAddKeyword(e: React.FormEvent) {
    e.preventDefault()
    if (!newKeyword.trim() || expandedCatId === null) return
    await window.api.categories.addKeyword(expandedCatId, newKeyword.trim())
    setNewKeyword('')
    setKeywords(await window.api.categories.listKeywords(expandedCatId))
  }

  const tierLabel: Record<number, string> = {
    1: 'Tier 1 — Trusted',
    2: 'Tier 2 — Unknown',
    3: 'Tier 3 — Flagged',
  }

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sources</h2>
          <button
            onClick={handleFetchNow}
            disabled={isFetching}
            className="text-sm bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700 disabled:opacity-50"
          >
            {isFetching ? 'Fetching…' : 'Fetch Now'}
          </button>
        </div>
        <SourceForm onSave={handleAddSource} />
        <ul className="mt-4 flex flex-col gap-2">
          {sources.map(s => (
            <li key={s.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <div>
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-gray-500 text-xs">{s.url}</span>
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={s.trust_tier}
                  onChange={e => handleTierChange(s.id, Number(e.target.value))}
                  className="text-xs border rounded px-1 py-0.5"
                >
                  <option value={1}>{tierLabel[1]}</option>
                  <option value={2}>{tierLabel[2]}</option>
                  <option value={3}>{tierLabel[3]}</option>
                </select>
                <button
                  onClick={() => handleToggleSource(s)}
                  className={`text-xs rounded px-2 py-0.5 ${s.active === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                >
                  {s.active === 1 ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => handleDeleteSource(s.id)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
          {sources.length === 0 && <p className="text-sm text-gray-400">No sources yet. Add one above.</p>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Categories</h2>
        <form onSubmit={handleAddCategory} className="flex gap-2 items-center">
          <input
            className="border rounded px-2 py-1 text-sm flex-1"
            placeholder="Category name"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
          />
          <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} className="h-8 w-10 rounded" />
          <button type="submit" className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700">Add</button>
        </form>
        <ul className="mt-4 flex flex-col gap-2">
          {categories.map(c => (
            <li key={c.id} className="border rounded text-sm">
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.color }} />
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExpandCategory(c.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {expandedCatId === c.id ? 'Hide keywords' : 'Keywords'}
                  </button>
                  <button onClick={() => handleDeleteCategory(c.id)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
              {expandedCatId === c.id && (
                <div className="border-t px-3 py-2 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1">
                    {keywords.map(kw => (
                      <span key={kw.id} className="flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">
                        {kw.keyword}
                        <button
                          onClick={() => handleRemoveKeyword(kw.id)}
                          className="text-gray-400 hover:text-red-600 leading-none"
                          aria-label={`Remove keyword ${kw.keyword}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {keywords.length === 0 && <span className="text-gray-400 text-xs">No keywords yet.</span>}
                  </div>
                  <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <input
                      className="border rounded px-2 py-1 text-xs flex-1"
                      placeholder="Add keyword…"
                      value={newKeyword}
                      onChange={e => setNewKeyword(e.target.value)}
                    />
                    <button type="submit" className="bg-blue-600 text-white rounded px-2 py-1 text-xs hover:bg-blue-700">
                      Add
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
