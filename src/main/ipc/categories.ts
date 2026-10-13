import { ipcMain } from 'electron'
import { openDb } from '../db/connection'
import {
  listCategories, createCategory, updateCategory, deleteCategory,
  addKeyword, removeKeyword, listKeywords
} from '../db/queries'
import { IPC } from '../db/types'

export function registerCategoryHandlers(): void {
  ipcMain.handle(IPC.CATEGORIES_LIST, () => listCategories(openDb()))
  ipcMain.handle(IPC.CATEGORIES_CREATE, (_e, data) => createCategory(openDb(), data))
  ipcMain.handle(IPC.CATEGORIES_UPDATE, (_e, id, data) => updateCategory(openDb(), id, data))
  ipcMain.handle(IPC.CATEGORIES_DELETE, (_e, id) => deleteCategory(openDb(), id))
  ipcMain.handle('categories:add-keyword', (_e, catId, keyword) => addKeyword(openDb(), catId, keyword))
  ipcMain.handle('categories:remove-keyword', (_e, keywordId) => removeKeyword(openDb(), keywordId))
  ipcMain.handle('categories:list-keywords', (_e, catId) => listKeywords(openDb(), catId))
}
