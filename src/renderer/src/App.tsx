import { useState } from 'react'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'

type Tab = 'feed' | 'settings'

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('feed')

  return (
    <div className="flex flex-col h-screen">
      <nav className="flex border-b bg-white">
        <button
          onClick={() => setActiveTab('feed')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'feed'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Feed
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Settings
        </button>
      </nav>
      <main className="flex-1 overflow-auto">
        {activeTab === 'feed' && <Home />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  )
}

export default App
