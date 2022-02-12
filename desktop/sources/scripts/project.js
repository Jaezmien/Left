'use strict'

const fs = require('fs')
const { ipcRenderer, dialog } = require('electron')

const Page = require('./page')
const Splash = require('./splash')

function Project () {
  this.pages = []

  this.index = 0
  this.original = ''

  this.start = function () {
    // Load previous files
    if (localStorage.hasOwnProperty('paths')) {
      if (isJSON(localStorage.getItem('paths'))) {
        const paths = JSON.parse(localStorage.getItem('paths'))
        for (const id in paths) {
          left.project.add(paths[id])
        }
      }
    }

    // Add splash
    if (this.pages.length === 0) {
      left.project.pages.push(new Splash())
      left.go.to_page(0)
    }
  }

  this.add = function (path = null) {
    console.log(`Adding page(${path})`)

    this.remove_splash()

    let page = new Page()

    if (path) {
      if (this.paths().indexOf(path) > -1) { console.warn(`Already open(skipped): ${path}`); return }
      page = new Page(this.load(path), path)
    }

    this.pages.push(page)
    left.go.to_page(this.pages.length - 1)

    localStorage.setItem('paths', JSON.stringify(this.paths()))
  }

  this.page = function () {
    return this.pages[this.index]
  }

  this.update = function () {
    if (!this.page()) { console.warn('Missing page'); return }

    this.page().commit(left.editor_el.value)
  }

  this.load = function (path) {
    console.log(`Load: ${path}`)

    let data
    try {
      data = fs.readFileSync(path, 'utf-8')
    } catch (err) {
      console.warn(`Could not load ${path}`)
      return
    }
    return data
  }

  // ========================

  ipcRenderer.on('left-project-new', () => {
    console.log('New Page')

    this.add()
    left.reload()

    setTimeout(() => { left.navi.next_page(); left.editor_el.focus() }, 200)
  })

  ipcRenderer.on('left-project-open', async () => {
    console.log('Open Pages')

    const paths =  await ipcRenderer.invoke(
      'show-dialog', 'showOpenDialogSync',
      { properties: ['openFile', 'multiSelections'] }
    )

    if (!paths) { console.log('Nothing to load'); return }

    for (const id in paths)
      this.add(paths[id])

    setTimeout(() => { left.navi.next_page(); left.update() }, 200)
  })

  ipcRenderer.on('left-project-save', () => {
    console.log('Save Page')

    const page = this.page()

    if (!page.path) { this.save_as(); return }

    fs.writeFile(page.path, page.text, (err) => {
      if (err) { alert('An error ocurred updating the file' + err.message); console.log(err); return }
      left.update()
      setTimeout(() => { left.stats.el.innerHTML = `<b>Saved</b> ${page.path}` }, 200)
    })
  })

  ipcRenderer.on('left-project-save-as', async () => {
    console.log('Save As Page')

    const page = this.page()
    const path = await ipcRenderer.invoke(
      'show-dialog', 'showSaveDialogSync'
    )

    if (!path) { console.log('Nothing to save'); return }

    fs.writeFile(path, page.text, (err) => {
      if (err) { alert('An error ocurred creating the file ' + err.message); return }
      if (!page.path) {
        page.path = path
      } else if (page.path !== path) {
        left.project.pages.push(new Page(page.text, path))
      }
      left.update()
      setTimeout(() => { left.stats.el.innerHTML = `<b>Saved</b> ${page.path}` }, 200)
    })
  })

  ipcRenderer.on('left-project-close', async () => {
    if (this.pages.length === 1) { console.warn('Cannot close'); return }

    if (this.page().has_changes()) {
      const path = await ipcRenderer.invoke('app-path')
      const response = await ipcRenderer.invoke(
        'show-dialog', 'showMessageBoxSync',
        {
          type: 'question',
          buttons: ['Yes', 'No'],
          title: 'Confirm',
          message: 'Are you sure you want to discard changes?',
          icon: `${path}/icon.png`
        }
      )
      if (response !== 0) {
        return
      }
    }
    this.force_close()
    localStorage.setItem('paths', JSON.stringify(this.paths()))
  })

  this.force_close = function () {
    if (this.pages.length === 1) { this.quit(); return }

    console.log('Closing...')

    this.pages.splice(this.index, 1)
    left.go.to_page(this.index - 1)
  }
  ipcRenderer.on('left-project-force-close', () => this.force_close())

  ipcRenderer.on('left-project-discard', async () => {
    const path = await ipcRenderer.invoke('app-path')
    const response = await ipcRenderer.invoke(
      'show-dialog', 'showMessageBoxSync',
      {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm',
        message: 'Are you sure you want to discard changes?',
        icon: `${path}/icon.png`
      }
    )
    if (response === 0) { // Runs the following if 'Yes' is clicked
      left.reload(true)
    }
  })

  this.has_changes = function () {
    for (const id in this.pages) {
      if (this.pages[id].has_changes()) { return true }
    }
    return false
  }

  ipcRenderer.on('left-project-quit', (e) => {
    if (this.has_changes()) {
      this.quit_dialog()
    } else {
      e.sender.send('exit')
    }
  })

  this.quit_dialog = async function () {
    const path = await ipcRenderer.invoke('app-path')
    const response = await ipcRenderer.invoke(
      'show-dialog',
      'showMessageBoxSync',
      {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm',
        message: 'Unsaved data will be lost. Are you sure you want to quit?',
        icon: `${path}/icon.png`
      }
    )
    if (response === 0) {
      ipcRenderer.send('exit')
    }
  }

  this.remove_splash = function () {
    for (const id in this.pages) {
      const page = this.pages[id]
      if (page.text === new Splash().text) {
        this.pages.splice(0, 1)
        return
      }
    }
  }

  this.paths = function () {
    const a = []
    for (const id in this.pages) {
      const page = this.pages[id]
      if (page.path) { a.push(page.path) }
    }
    return a
  }

  function isJSON (text) { try { JSON.parse(text); return true } catch (error) { return false } }
}

module.exports = Project
