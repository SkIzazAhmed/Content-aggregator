import { ipcMain } from 'electron'
import { openDb } from '../db/connection'
import { listSources, createSource, updateSource, deleteSource } from '../db/queries'
import { fetchAllNow } from '../ingestion/scheduler'
import { IPC } from '../db/types'

export function registerSourceHandlers(): void {
  ipcMain.handle(IPC.SOURCES_LIST, () => listSources(openDb()))

  ipcMain.handle(IPC.SOURCES_CREATE, (_e, data) =>
    createSource(openDb(), data)
  )

  ipcMain.handle(IPC.SOURCES_UPDATE, (_e, id, data) =>
    updateSource(openDb(), id, data)
  )

  ipcMain.handle(IPC.SOURCES_DELETE, (_e, id) =>
    deleteSource(openDb(), id)
  )

  ipcMain.handle(IPC.SOURCES_FETCH_NOW, () => fetchAllNow())
}
