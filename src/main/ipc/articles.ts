import { ipcMain } from 'electron'
import { openDb } from '../db/connection'
import { getFeed, searchArticles } from '../db/queries'
import { IPC } from '../db/types'

export function registerArticleHandlers(): void {
  ipcMain.handle(IPC.ARTICLES_FEED, (_e, params) => getFeed(openDb(), params))
  ipcMain.handle(IPC.ARTICLES_SEARCH, (_e, params) => searchArticles(openDb(), params))
}
