import { useState } from 'react'

interface Props {
  onSave: (data: { name: string; url: string; type: 'rss' | 'nitter'; trust_tier: 1 | 2 | 3 }) => void
}

export function SourceForm({ onSave }: Props) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState<'rss' | 'nitter'>('rss')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    if (type === 'nitter' && !url.trim().endsWith('/rss')) {
      alert('Nitter feeds must end with /rss (e.g. https://nitter.net/username/rss)')
      return
    }
    onSave({ name: name.trim(), url: url.trim(), type, trust_tier: 2 })
    setName(''); setUrl('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        className="border rounded px-2 py-1 text-sm"
        placeholder="Source name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input
        className="border rounded px-2 py-1 text-sm"
        placeholder="Feed URL (RSS or Nitter /username/rss)"
        value={url}
        onChange={e => setUrl(e.target.value)}
      />
      <select
        className="border rounded px-2 py-1 text-sm"
        value={type}
        onChange={e => setType(e.target.value as 'rss' | 'nitter')}
      >
        <option value="rss">RSS / Atom</option>
        <option value="nitter">Nitter (Twitter)</option>
      </select>
      <button type="submit" className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700">
        Add Source
      </button>
    </form>
  )
}
