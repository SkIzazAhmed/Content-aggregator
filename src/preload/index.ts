import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/db/types'
import type { Source, Category, ArticleWithMeta, SearchParams } from '../main/db/types'

const api = {
  sources: {
    list: (): Promise<Source[]> => ipcRenderer.invoke(IPC.SOURCES_LIST),
    create: (data: Pick<Source, 'name' | 'url' | 'type' | 'trust_tier'>): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.SOURCES_CREATE, data),
    update: (id: number, data: Partial<Source>): Promise<void> =>
      ipcRenderer.invoke(IPC.SOURCES_UPDATE, id, data),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke(IPC.SOURCES_DELETE, id),
    fetchNow: (): Promise<void> =>
      ipcRenderer.invoke(IPC.SOURCES_FETCH_NOW),
  },
  articles: {
    getFeed: (params: Omit<SearchParams, 'query'>): Promise<ArticleWithMeta[]> =>
      ipcRenderer.invoke(IPC.ARTICLES_FEED, params),
    search: (params: SearchParams): Promise<ArticleWithMeta[]> =>
      ipcRenderer.invoke(IPC.ARTICLES_SEARCH, params),
  },
  categories: {
    list: (): Promise<Category[]> => ipcRenderer.invoke(IPC.CATEGORIES_LIST),
    create: (data: Pick<Category, 'name' | 'color'>): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.CATEGORIES_CREATE, data),
    update: (id: number, data: Partial<Category>): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_UPDATE, id, data),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_DELETE, id),
    addKeyword: (catId: number, keyword: string): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_ADD_KEYWORD, catId, keyword),
    removeKeyword: (keywordId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.CATEGORIES_REMOVE_KEYWORD, keywordId),
    listKeywords: (catId: number): Promise<Array<{ id: number; category_id: number; keyword: string }>> =>
      ipcRenderer.invoke(IPC.CATEGORIES_LIST_KEYWORDS, catId),
  },
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
