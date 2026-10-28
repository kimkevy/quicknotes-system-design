const API_URL = 'https://jsonplaceholder.typicode.com/posts';

// DOM elements
const loadBtn = document.getElementById('load-btn');
const statusEl = document.getElementById('status');
const noteForm = document.getElementById('note-form');
const titleInput = document.getElementById('title-input');
const bodyInput = document.getElementById('body-input');
const submitBtn = document.getElementById('submit-btn');
const notesList = document.getElementById('notes-list');

// In-memory notes state
let notes = [];

// Helper to set status message
function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = type;
}

// Helper to toggle busy state and disable/enable buttons
function setBusy(isBusy) {
  if (loadBtn) loadBtn.disabled = isBusy;
  if (submitBtn) submitBtn.disabled = isBusy;
  const deleteButtons = notesList.querySelectorAll('button.delete-btn');
  deleteButtons.forEach((btn) => {
    btn.disabled = isBusy;
  });
}

// Reusable async request wrapper
async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// Render notes list or empty state (using textContent only)
function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-state';
    emptyItem.textContent = 'No notes found.';
    notesList.appendChild(emptyItem);
    return;
  }

  notes.forEach((note) => {
    const li = document.createElement('li');
    li.dataset.id = note.id;

    const heading = document.createElement('h3');
    heading.textContent = note.title;

    const paragraph = document.createElement('p');
    paragraph.textContent = note.body;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteNote(note.id));

    li.appendChild(heading);
    li.appendChild(paragraph);
    li.appendChild(deleteBtn);

    notesList.appendChild(li);
  });
}

// GET (load 10 notes)
async function loadNotes() {
  setBusy(true);
  setStatus('Loading notes...', 'loading');
  try {
    const data = await request(`${API_URL}?_limit=10`);
    notes = data;
    renderNotes();
    if (notes.length === 0) {
      setStatus('No notes available.', '');
    } else {
      setStatus('Notes loaded successfully.', 'success');
    }
  } catch (error) {
    setStatus(`Failed to load notes: ${error.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// POST (create note)
async function createNote(title, body) {
  setBusy(true);
  setStatus('Creating note...', 'loading');
  try {
    const newNote = await request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body })
    });

    notes.unshift(newNote);
    renderNotes();
    noteForm.reset();
    setStatus('Note created successfully.', 'success');
  } catch (error) {
    setStatus(`Failed to create note: ${error.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// DELETE (remove note)
async function deleteNote(id) {
  setBusy(true);
  setStatus(`Deleting note #${id}...`, 'loading');
  try {
    await request(`${API_URL}/${id}`, {
      method: 'DELETE'
    });

    notes = notes.filter((n) => n.id !== id);
    renderNotes();
    setStatus('Note deleted successfully.', 'success');
  } catch (error) {
    setStatus(`Failed to delete note: ${error.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// Form submission handler with validation
noteForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  // Validation: title required and max 100 characters
  if (!title) {
    setStatus('Title is required.', 'error');
    titleInput.focus();
    return;
  }

  if (title.length > 100) {
    setStatus('Title must not exceed 100 characters.', 'error');
    titleInput.focus();
    return;
  }

  createNote(title, body);
});

// Load notes button handler
loadBtn.addEventListener('click', () => {
  loadNotes();
});
