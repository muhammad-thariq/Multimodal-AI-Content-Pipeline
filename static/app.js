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
  videoInput: document.getElementById('videoInput'),
  filePreview: document.getElementById('filePreview'),

  // Start Button
  startBtn: document.getElementById('startBtn'),

  // Progress
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressPercentage: document.getElementById('progressPercentage'),
  progressMessage: document.getElementById('progressMessage'),

  // Logs
  logsTerminal: document.getElementById('logsTerminal'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),

  // Download
  downloadSection: document.getElementById('downloadSection'),
  downloadGrid: document.getElementById('downloadGrid'),
};

// ==========================================
// SOCKET.IO CONNECTION
// ==========================================
function initializeSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('✅ Connected to server');
    addLog('🔌 Connected to server', 'success');
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
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
}

// ==========================================
// FILE UPLOAD HANDLERS
// ==========================================
function setupFileUpload() {
  // Click to upload
  elements.uploadZone.addEventListener('click', () => {
    if (!isProcessing) {
      elements.videoInput.click();
    }
  });

  elements.videoInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
  });

  // Drag and drop
  elements.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isProcessing) {
      elements.uploadZone.classList.add('dragover');
    }
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
        alert('Please drop a valid video file');
      }
    }
  });
}

function handleFileSelect(file) {
  if (!file) return;

  if (!file.type.startsWith('video/')) {
    alert('Please select a video file');
    return;
  }

  videoFile = file;
  elements.filePreview.textContent = `✓ ${file.name} (${formatFileSize(file.size)})`;
  elements.filePreview.classList.remove('hidden');
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
    // Validation - only check for video file
    if (!videoFile) {
      alert('Please upload a video file first');
      return;
    }

    // Start processing
    await startProcessing();
  });
}

async function startProcessing() {
  try {
    isProcessing = true;
    elements.startBtn.disabled = true;
    elements.startBtn.querySelector('.btn-text').textContent = 'Processing...';

    // Show progress section
    elements.progressSection.classList.remove('hidden');
    elements.downloadSection.classList.add('hidden');

    // Reset progress
    updateProgress(0, 'Initializing...');
    clearLogs();

    // Reset all steps to queued (now 7 steps)
    for (let i = 1; i <= 7; i++) {
      updateStepStatus(i, 'queued', 'Waiting...');
    }

    // Prepare form data - only send video file
    const formData = new FormData();
    formData.append('video_file', videoFile);

    // Send request
    const response = await fetch('/start_processing', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.status === 'error') {
      throw new Error(result.message);
    }

    addLog('✅ Processing request sent successfully', 'success');

  } catch (error) {
    console.error('Error starting processing:', error);
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

  if (message) {
    elements.progressMessage.textContent = message;
  }
}

function updateStepStatus(stepId, status, message = '') {
  const stepElement = document.querySelector(`.step-item[data-step="${stepId}"]`);
  if (!stepElement) return;

  // Remove all status classes
  stepElement.classList.remove('queued', 'running', 'completed', 'failed');

  // Add new status class
  stepElement.classList.add(status);

  // Update description if message provided
  if (message) {
    const descriptionElement = stepElement.querySelector('.step-description');
    if (descriptionElement) {
      descriptionElement.textContent = message;
    }
  }
}

// ==========================================
// LOG MANAGEMENT
// ==========================================
function addLog(message, type = '') {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = message;

  elements.logsTerminal.appendChild(logEntry);

  // Auto-scroll to bottom
  elements.logsTerminal.scrollTop = elements.logsTerminal.scrollHeight;
}

function clearLogs() {
  elements.logsTerminal.innerHTML = '<div class="log-entry">Ready to process...</div>';
}

function setupClearLogs() {
  elements.clearLogsBtn.addEventListener('click', clearLogs);
}

// ==========================================
// PROCESSING COMPLETE
// ==========================================
function onProcessingComplete(files) {
  isProcessing = false;
  elements.startBtn.disabled = false;
  elements.startBtn.querySelector('.btn-text').textContent = 'Start Processing';

  addLog('🎉 All processing completed!', 'success');

  // Show download section
  elements.downloadSection.classList.remove('hidden');

  // Display download links
  displayDownloadLinks(files);
}

function displayDownloadLinks(files) {
  elements.downloadGrid.innerHTML = '';

  files.forEach(filename => {
    const downloadItem = createDownloadItem(filename);
    elements.downloadGrid.appendChild(downloadItem);
  });
}

function createDownloadItem(filename) {
  const a = document.createElement('a');
  a.href = `/files/${filename}`;
  a.className = 'download-item';
  a.target = '_blank';

  const icon = getFileIcon(filename);
  const type = getFileType(filename);

  a.innerHTML = `
        <div class="download-icon">${icon}</div>
        <div class="download-info">
            <div class="download-name">${filename}</div>
            <div class="download-type">${type}</div>
        </div>
    `;

  return a;
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const iconMap = {
    'mp4': '🎥',
    'txt': '📄',
    'wav': '🔊',
    'srt': '💬',
  };
  return iconMap[ext] || '📁';
}

function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const typeMap = {
    'mp4': 'Video File',
    'txt': 'Text File',
    'wav': 'Audio File',
    'srt': 'Subtitle File',
  };
  return typeMap[ext] || 'File';
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
}

// ==========================================
// LOAD EXISTING FILES
// ==========================================
async function loadExistingFiles() {
  try {
    const response = await fetch('/existing_files');
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      elements.downloadSection.classList.remove('hidden');
      displayDownloadLinks(data.files);
    }
  } catch (error) {
    console.error('Error loading existing files:', error);
  }
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initializeSocket();
  setupFileUpload();
  setupStartButton();
  setupClearLogs();
  loadExistingFiles();

  console.log('🚀 Application initialized');
});
