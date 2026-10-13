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
  ipcMain.handle(IPC.CATEGORIES_ADD_KEYWORD, (_e, catId, keyword) => addKeyword(openDb(), catId, keyword))
  ipcMain.handle(IPC.CATEGORIES_REMOVE_KEYWORD, (_e, keywordId) => removeKeyword(openDb(), keywordId))
  ipcMain.handle(IPC.CATEGORIES_LIST_KEYWORDS, (_e, catId) => listKeywords(openDb(), catId))
}
