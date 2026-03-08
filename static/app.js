// ==========================================
// GLOBAL STATE
// ==========================================
let socket = null;
let videoFile = null;
let isProcessing = false;

// ==========================================
// DOM ELEMENTS
// ==========================================
const elements = {
  uploadZone: document.getElementById('uploadZone'),
  uploadPlaceholder: document.getElementById('uploadPlaceholder'),
  videoInput: document.getElementById('videoInput'),
  videoPreview: document.getElementById('videoPreview'),
  filePreview: document.getElementById('filePreview'),
  removeVideoBtn: document.getElementById('removeVideoBtn'),
  videoTopic: document.getElementById('videoTopic'),

  startBtn: document.getElementById('startBtn'),

  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressPercentage: document.getElementById('progressPercentage'),
  progressMessage: document.getElementById('progressMessage'),

  logsTerminal: document.getElementById('logsTerminal'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),

  // Script Generator
  scriptTextarea: document.getElementById('scriptTextarea'),
  scriptOverlayText: document.getElementById('scriptOverlayText'),
  charCounter: document.getElementById('charCounter'),
  scriptActions: document.getElementById('scriptActions'),
  btnRegenerate: document.getElementById('btnRegenerate'),
  btnPolish: document.getElementById('btnPolish'),
  btnSaveEdit: document.getElementById('btnSaveEdit'),
  btnApprove: document.getElementById('btnApprove'),
};

// ==========================================
// SOCKET.IO CONNECTION
// ==========================================
function initializeSocket() {
  socket = io();

  socket.on('connect', () => {
    addLog('🔌 Connected to server', 'success');
  });

  socket.on('disconnect', () => {
    addLog('🔌 Disconnected from server', 'error');
  });

  socket.on('progress_update', (data) => {
    updateProgress(data.percentage, data.message);
  });

  socket.on('step_update', (data) => {
    updateStepStatus(data.step_id, data.status, data.message);
  });

  socket.on('log_message', (data) => {
    addLog(data.message);
  });

  socket.on('processing_complete', (data) => {
    onProcessingComplete(data.files);
  });

  socket.on('processing_error', (data) => {
    onProcessingError(data.message);
  });

  socket.on('script_review', (data) => {
    showScriptForReview(data.script);
  });
}

// ==========================================
// FILE UPLOAD
// ==========================================
function setupFileUpload() {
  elements.uploadZone.addEventListener('click', (e) => {
    if (e.target.closest('video')) return;
    if (!isProcessing) elements.videoInput.click();
  });

  elements.videoInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
  });

  elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isProcessing) elements.uploadZone.classList.add('dragover');
  });

  elements.uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
  });

  elements.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadZone.classList.remove('dragover');
    if (!isProcessing) {
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) {
        handleFileSelect(file);
      } else {
        alert('Please drop a valid video file (MP4, MOV)');
      }
    }
  });

  // Remove video button
  elements.removeVideoBtn.addEventListener('click', () => {
    if (isProcessing) return;
    videoFile = null;
    elements.videoPreview.src = '';
    elements.videoPreview.classList.add('hidden');
    elements.uploadPlaceholder.classList.remove('hidden');
    elements.filePreview.classList.add('hidden');
    elements.removeVideoBtn.classList.add('hidden');
    elements.videoInput.value = '';

    // Reset dashed styling
    elements.uploadZone.style.borderStyle = 'dashed';
    elements.uploadZone.style.padding = 'var(--spacing-lg)';
  });
}

function handleFileSelect(file) {
  if (!file || !file.type.startsWith('video/')) {
    alert('Please select a video file');
    return;
  }

  videoFile = file;

  const url = URL.createObjectURL(file);
  elements.videoPreview.src = url;
  elements.videoPreview.classList.remove('hidden');
  elements.uploadPlaceholder.classList.add('hidden');
  elements.removeVideoBtn.classList.remove('hidden');

  elements.filePreview.textContent = `✓ ${file.name} (${formatFileSize(file.size)})`;
  elements.filePreview.classList.remove('hidden');

  // Hide border when video is shown to match screenshot 1 perfectly
  elements.uploadZone.style.borderStyle = 'none';
  elements.uploadZone.style.padding = '0';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ==========================================
// START PROCESSING
// ==========================================
function setupStartButton() {
  elements.startBtn.addEventListener('click', async () => {
    // If button is in download mode, trigger the download
    if (finalVideoUrl) {
      window.open(finalVideoUrl, '_blank');
      // Reset button back to Start Processing after download
      finalVideoUrl = null;
      elements.startBtn.querySelector('.btn-icon').textContent = '🚀';
      elements.startBtn.querySelector('.btn-text').textContent = 'Start Processing';
      elements.startBtn.classList.remove('btn-download-ready');
      return;
    }

    if (!videoFile) {
      alert('Please upload a video file first');
      return;
    }
    await startProcessing();
  });
}

async function startProcessing() {
  try {
    isProcessing = true;
    elements.startBtn.disabled = true;
    elements.startBtn.querySelector('.btn-text').textContent = 'Processing...';

    elements.progressSection.classList.remove('hidden');

    updateProgress(0, 'Initializing...');
    clearLogs();

    for (let i = 1; i <= 7; i++) {
      updateStepStatus(i, 'queued');
    }

    // Reset script editor
    elements.scriptTextarea.value = '';
    elements.charCounter.textContent = '0 chars';
    elements.scriptOverlayText.classList.remove('hidden');
    elements.scriptOverlayText.textContent = 'Processing video to generate script...';
    setScriptButtonsDisabled(true);

    const formData = new FormData();
    formData.append('video_file', videoFile);
    // Include video topic if provided
    if (elements.videoTopic.value.trim() !== '') {
      formData.append('video_topic', elements.videoTopic.value.trim());
    }

    const response = await fetch('/start_processing', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    if (result.status === 'error') throw new Error(result.message);

    addLog('✅ Processing request sent successfully', 'success');

  } catch (error) {
    addLog(`❌ Error: ${error.message}`, 'error');
    resetProcessingState();
    alert(`Failed to start processing: ${error.message}`);
  }
}

// ==========================================
// PROGRESS UPDATES
// ==========================================
function updateProgress(percentage, message = '') {
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressPercentage.textContent = `${Math.round(percentage)}%`;
  if (message) elements.progressMessage.textContent = message;
}

function updateStepStatus(stepId, status) {
  const el = document.querySelector(`.step-item[data-step="${stepId}"]`);
  if (!el) return;
  el.classList.remove('queued', 'running', 'completed', 'failed');
  el.classList.add(status);
}

// ==========================================
// LOG MANAGEMENT
// ==========================================
function addLog(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  elements.logsTerminal.appendChild(entry);
  elements.logsTerminal.scrollTop = elements.logsTerminal.scrollHeight;
}

function clearLogs() {
  elements.logsTerminal.innerHTML = '<div class="log-entry">Ready to process...</div>';
}

function setupClearLogs() {
  elements.clearLogsBtn.addEventListener('click', clearLogs);
}

// ==========================================
// SCRIPT REVIEW ACTIONS
// ==========================================
function showScriptForReview(scriptText) {
  elements.scriptTextarea.value = scriptText;
  elements.charCounter.textContent = `${scriptText.length} chars`;

  // Hide the center overlay text
  elements.scriptOverlayText.classList.add('hidden');

  setScriptButtonsDisabled(false);
  elements.scriptTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elements.scriptTextarea.focus();
}

function setScriptButtonsDisabled(disabled) {
  elements.btnApprove.disabled = disabled;
  elements.btnSaveEdit.disabled = disabled;
  elements.btnPolish.disabled = disabled;
  elements.btnRegenerate.disabled = disabled;
}

function setupScriptReview() {
  elements.scriptTextarea.addEventListener('input', () => {
    elements.charCounter.textContent = `${elements.scriptTextarea.value.length} chars`;
    if (elements.scriptTextarea.value.trim() === '') {
      elements.scriptOverlayText.classList.remove('hidden');
      elements.scriptOverlayText.textContent = 'Script is empty. Type or regenerate.';
    } else {
      elements.scriptOverlayText.classList.add('hidden');
    }
  });

  elements.btnRegenerate.addEventListener('click', () => {
    setScriptButtonsDisabled(true);
    socket.emit('script_review_response', { action: 'regenerate', text: '' });
    elements.scriptOverlayText.classList.remove('hidden');
    elements.scriptOverlayText.textContent = '🔄 Regenerating script...';
    elements.scriptTextarea.value = '';
    addLog('🔄 Regenerating script...', 'warning');
  });

  elements.btnPolish.addEventListener('click', () => {
    setScriptButtonsDisabled(true);

    // We send 'polish' back. We will need to update app.py to handle "polish" if we want to do something with it. 
    // Right now, we can treat it like generate but maybe a different prompt in backend? 
    // For now, emit it so UI functions correctly.
    socket.emit('script_review_response', { action: 'polish', text: elements.scriptTextarea.value });

    elements.scriptOverlayText.classList.remove('hidden');
    elements.scriptOverlayText.textContent = '✨ Polishing script...';
    elements.scriptTextarea.value = '';
    addLog('✨ Polishing script...', 'warning');
  });

  elements.btnSaveEdit.addEventListener('click', () => {
    setScriptButtonsDisabled(true);
    socket.emit('script_review_response', { action: 'edit', text: elements.scriptTextarea.value });
    addLog('💾 Script edits saved', 'success');
  });

  elements.btnApprove.addEventListener('click', () => {
    setScriptButtonsDisabled(true);
    socket.emit('script_review_response', { action: 'approve', text: '' });
    addLog('✅ Script approved', 'success');
  });
}

// ==========================================
// PROCESSING COMPLETE
// ==========================================
let finalVideoUrl = null;

function onProcessingComplete(files) {
  isProcessing = false;
  addLog('🎉 All processing completed!', 'success');

  // Find the final burned-subtitle video (the last mp4 that isn't output_9x16_letterbox.mp4)
  const finalVideo = files.reverse().find(f =>
    f.endsWith('.mp4') && f !== 'output_9x16_letterbox.mp4'
  );

  if (finalVideo) {
    finalVideoUrl = `/files/${encodeURIComponent(finalVideo)}`;
    elements.startBtn.disabled = false;
    elements.startBtn.querySelector('.btn-icon').textContent = '✅';
    elements.startBtn.querySelector('.btn-text').textContent = 'Download Video';
    elements.startBtn.classList.add('btn-download-ready');
  } else {
    // Fallback if no final video found
    resetProcessingState();
  }
}

// ==========================================
// ERROR HANDLING
// ==========================================
function onProcessingError(message) {
  addLog(`❌ Processing error: ${message}`, 'error');
  resetProcessingState();
  alert(`Processing failed: ${message}`);
}

function resetProcessingState() {
  isProcessing = false;
  elements.startBtn.disabled = false;
  elements.startBtn.querySelector('.btn-text').textContent = 'Start Processing';
  setScriptButtonsDisabled(false); // In case it failed mid-review
}

// ==========================================
// INITIALIZE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initializeSocket();
  setupFileUpload();
  setupStartButton();
  setupClearLogs();
  setupScriptReview();
});
