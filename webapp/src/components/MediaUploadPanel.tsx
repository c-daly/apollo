import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { getHCGConfig } from '../lib/config'
import './MediaUploadPanel.css'

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
  success: boolean
}

interface MediaIngestResponse {
  sample_id: string
  file_path: string
  media_type: string
  metadata: {
    file_size: number
    mime_type: string
    width?: number
    height?: number
    duration?: number
  }
  neo4j_node_id: string
  message: string
}

const ACCEPTED_TYPES = {
  IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
  VIDEO: ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'],
  AUDIO: ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'],
}

const ALL_ACCEPTED = [
  ...ACCEPTED_TYPES.IMAGE,
  ...ACCEPTED_TYPES.VIDEO,
  ...ACCEPTED_TYPES.AUDIO,
].join(',')

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

function MediaUploadPanel() {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: false,
  })
  const [lastUpload, setLastUpload] = useState<MediaIngestResponse | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const apolloApiBase =
    getHCGConfig().apiUrl?.replace(/\/$/, '') || 'http://localhost:8082'

  const detectMediaType = (file: File): string => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
    if (ACCEPTED_TYPES.IMAGE.includes(ext)) return 'IMAGE'
    if (ACCEPTED_TYPES.VIDEO.includes(ext)) return 'VIDEO'
    if (ACCEPTED_TYPES.AUDIO.includes(ext)) return 'AUDIO'
    return 'UNKNOWN'
  }

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
    }

    const mediaType = detectMediaType(file)
    if (mediaType === 'UNKNOWN') {
      return 'Unsupported file type. Please upload an image, video, or audio file.'
    }

    return null
  }

  const handleFile = (file: File) => {
    const error = validateFile(file)
    if (error) {
      setUploadState({ uploading: false, progress: 0, error, success: false })
      return
    }

    setSelectedFile(file)
    setUploadState({ uploading: false, progress: 0, error: null, success: false })

    // Generate preview for images
    const mediaType = detectMediaType(file)
    if (mediaType === 'IMAGE') {
      const reader = new FileReader()
      reader.onload = e => {
        setPreviewUrl(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setPreviewUrl(null)
    }
  }

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    const mediaType = detectMediaType(selectedFile)
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('media_type', mediaType)
    if (question.trim()) {
      formData.append('question', question.trim())
    }

    setUploadState({ uploading: true, progress: 0, error: null, success: false })

    try {
      const response = await fetch(`${apolloApiBase}/api/media/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }))
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`)
      }

      const data: MediaIngestResponse = await response.json()
      setLastUpload(data)
      setUploadState({ uploading: false, progress: 100, error: null, success: true })
      
      // Reset form
      setTimeout(() => {
        setSelectedFile(null)
        setPreviewUrl(null)
        setQuestion('')
        setUploadState({ uploading: false, progress: 0, error: null, success: false })
      }, 3000)
    } catch (error) {
      setUploadState({
        uploading: false,
        progress: 0,
        error: error instanceof Error ? error.message : 'Upload failed',
        success: false,
      })
    }
  }

  const handleCancel = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setQuestion('')
    setUploadState({ uploading: false, progress: 0, error: null, success: false })
  }

  return (
    <div className="media-upload-panel">
      <div className="panel-header">
        <h2>Upload Media Sample</h2>
        <p className="panel-description">
          Upload images, videos, or audio files for perception workflows
        </p>
      </div>

      <div
        className={`dropzone ${dragActive ? 'drag-active' : ''} ${
          selectedFile ? 'has-file' : ''
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !selectedFile && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALL_ACCEPTED}
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />

        {!selectedFile ? (
          <div className="dropzone-content">
            <div className="upload-icon">📁</div>
            <p className="dropzone-text">
              Drag & drop files here or <span className="link-text">click to browse</span>
            </p>
            <p className="dropzone-hint">
              Accepted: Images, Videos, Audio • Max size: 100MB
            </p>
          </div>
        ) : (
          <div className="file-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="preview-image" />
            ) : (
              <div className="file-icon">
                {detectMediaType(selectedFile) === 'VIDEO' ? '🎥' : '🎵'}
              </div>
            )}
            <div className="file-info">
              <p className="file-name">{selectedFile.name}</p>
              <p className="file-meta">
                {detectMediaType(selectedFile)} • {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
      </div>

      {uploadState.error && (
        <div className="upload-error">
          <span className="error-icon">⚠️</span>
          {uploadState.error}
        </div>
      )}

      {uploadState.success && lastUpload && (
        <div className="upload-success">
          <span className="success-icon">✅</span>
          <div>
            <p>Upload successful!</p>
            <p className="success-detail">Sample ID: {lastUpload.sample_id}</p>
          </div>
        </div>
      )}

      {selectedFile && !uploadState.success && (
        <>
          <div className="form-group">
            <label htmlFor="question">Question (optional)</label>
            <input
              id="question"
              type="text"
              className="question-input"
              placeholder="What will happen next in this video?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              disabled={uploadState.uploading}
            />
          </div>

          <div className="upload-actions">
            <button
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={uploadState.uploading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploadState.uploading}
            >
              {uploadState.uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>

          {uploadState.uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <p className="progress-text">Uploading... {uploadState.progress}%</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MediaUploadPanel
