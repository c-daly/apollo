import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MediaUploadPanel from '../components/MediaUploadPanel'
import { resetFetchMock, mockFetchSuccess, mockFetchError } from './setup'

// Helper to create a file input change event
const selectFile = (input: HTMLInputElement, file: File) => {
  fireEvent.change(input, { target: { files: [file] } })
}

describe('MediaUploadPanel', () => {
  beforeEach(() => {
    resetFetchMock()
  })

  describe('Rendering', () => {
    it('renders the upload interface with dropzone', () => {
      render(<MediaUploadPanel />)
      
      expect(screen.getByText(/upload media sample/i)).toBeInTheDocument()
      expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument()
      expect(screen.getByText(/accepted: images, videos, audio/i)).toBeInTheDocument()
    })
  })

  describe('File Selection', () => {
    it('allows user to select a file via hidden input', async () => {
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      
      selectFile(input, file)
      
      await waitFor(() => {
        expect(screen.getByText('test.png')).toBeInTheDocument()
      })
    })

    it('shows image preview for image files', async () => {
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      
      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: function(this: FileReader) {
          setTimeout(() => {
            this.onload?.({ target: { result: 'data:image/png;base64,fake' } } as ProgressEvent<FileReader>)
          }, 0)
        }
      } as unknown as FileReader
      globalThis.FileReader = vi.fn(() => mockFileReader) as unknown as typeof FileReader
      
      selectFile(input, file)
      
      await waitFor(() => {
        const preview = screen.getByAltText(/preview/i)
        expect(preview).toBeInTheDocument()
        expect(preview).toHaveAttribute('src', 'data:image/png;base64,fake')
      })
    })

    it('validates file size and shows error', async () => {
      render(<MediaUploadPanel />)
      
      // Create a file larger than 100MB (mock the size property)
      const largeFile = new File(['content'], 'large.png', { type: 'image/png' })
      Object.defineProperty(largeFile, 'size', { value: 101 * 1024 * 1024 })
      
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, largeFile)
      
      await waitFor(() => {
        expect(screen.getByText(/file too large/i)).toBeInTheDocument()
      })
    })

    it('validates file type and shows error', async () => {
      render(<MediaUploadPanel />)
      
      const invalidFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      
      selectFile(input, invalidFile)
      
      await waitFor(() => {
        expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument()
      })
    })

    it('shows video icon for video files', async () => {
      render(<MediaUploadPanel />)
      
      const videoFile = new File(['video content'], 'test.mp4', { type: 'video/mp4' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      
      selectFile(input, videoFile)
      
      await waitFor(() => {
        expect(screen.getByText('test.mp4')).toBeInTheDocument()
        // More specific - look within file-meta, not the description
        const fileMeta = document.querySelector('.file-meta')
        expect(fileMeta).toHaveTextContent('VIDEO')
      })
    })

    it('shows audio icon for audio files', async () => {
      render(<MediaUploadPanel />)
      
      const audioFile = new File(['audio content'], 'test.mp3', { type: 'audio/mp3' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      
      selectFile(input, audioFile)
      
      await waitFor(() => {
        expect(screen.getByText('test.mp3')).toBeInTheDocument()
        // More specific - look within file-meta, not the description
        const fileMeta = document.querySelector('.file-meta')
        expect(fileMeta).toHaveTextContent('AUDIO')
      })
    })
  })

  describe('Upload Process', () => {
    it('shows Upload button only after file is selected', async () => {
      render(<MediaUploadPanel />)
      
      // No upload button initially
      expect(screen.queryByRole('button', { name: /^upload$/i })).not.toBeInTheDocument()
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, file)
      
      // Upload button appears after file selection
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument()
      })
    })

    it('uploads file successfully', async () => {
      const user = userEvent.setup()
      mockFetchSuccess({
        sample_id: 'test-123',
        file_path: '/uploads/test.png',
        media_type: 'IMAGE',
        metadata: { file_size: 1024, mime_type: 'image/png' },
        neo4j_node_id: 'node-123',
        message: 'Upload successful',
      })
      
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, file)
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument()
      })
      
      const uploadButton = screen.getByRole('button', { name: /^upload$/i })
      await user.click(uploadButton)
      
      await waitFor(() => {
        expect(screen.getByText(/upload successful/i)).toBeInTheDocument()
        expect(screen.getByText(/test-123/i)).toBeInTheDocument()
      })
    })

    it('shows "Uploading..." text during upload', async () => {
      const user = userEvent.setup()
      
      // Delay the mock response to keep "Uploading..." visible
      let resolveUpload: (value: Response) => void
      const uploadPromise = new Promise<Response>(resolve => { resolveUpload = resolve })
      globalThis.fetch = vi.fn(() => uploadPromise)
      
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, file)
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument()
      })
      
      const uploadButton = screen.getByRole('button', { name: /^upload$/i })
      await user.click(uploadButton)
      
      // Check for "Uploading..." button text
      expect(screen.getByRole('button', { name: /uploading/i })).toBeInTheDocument()
      
      // Resolve to clean up
      resolveUpload!(new Response(JSON.stringify({
        sample_id: 'test-123',
        file_path: '/uploads/test.png',
        media_type: 'IMAGE',
        metadata: { file_size: 1024, mime_type: 'image/png' },
        neo4j_node_id: 'node-123',
        message: 'Upload successful',
      }), { status: 200 }))
    })

    it('handles upload errors', async () => {
      const user = userEvent.setup()
      mockFetchError('Network error', 500)
      
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, file)
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument()
      })
      
      const uploadButton = screen.getByRole('button', { name: /^upload$/i })
      await user.click(uploadButton)
      
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })

    it('sends correct FormData with file and question', async () => {
      const user = userEvent.setup()
      mockFetchSuccess({
        sample_id: 'test-123',
        file_path: '/uploads/test.png',
        media_type: 'IMAGE',
        metadata: { file_size: 1024, mime_type: 'image/png' },
        neo4j_node_id: 'node-123',
        message: 'Upload successful',
      })
      
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, file)
      
      await waitFor(() => {
        expect(screen.getByLabelText(/question/i)).toBeInTheDocument()
      })
      
      const questionInput = screen.getByLabelText(/question/i)
      await user.type(questionInput, 'What is this?')
      
      const uploadButton = screen.getByRole('button', { name: /^upload$/i })
      await user.click(uploadButton)
      
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/media/upload'),
          expect.objectContaining({
            method: 'POST',
            body: expect.any(FormData),
          })
        )
      })
    })

    it('shows Cancel button and clears selection when clicked', async () => {
      const user = userEvent.setup()
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      selectFile(input, file)
      
      await waitFor(() => {
        expect(screen.getByText('test.png')).toBeInTheDocument()
      })
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)
      
      await waitFor(() => {
        expect(screen.queryByText('test.png')).not.toBeInTheDocument()
        expect(screen.getByText(/drag & drop files here/i)).toBeInTheDocument()
      })
    })
  })

  describe('Drag and Drop', () => {
    it('highlights dropzone on drag over', () => {
      render(<MediaUploadPanel />)
      
      const dropzone = screen.getByText(/drag & drop/i).closest('.dropzone')
      expect(dropzone).toBeInTheDocument()
      
      fireEvent.dragEnter(dropzone!)
      expect(dropzone).toHaveClass('drag-active')
      
      fireEvent.dragLeave(dropzone!)
      expect(dropzone).not.toHaveClass('drag-active')
    })

    it('handles file drop', async () => {
      render(<MediaUploadPanel />)
      
      const file = new File(['test content'], 'test.png', { type: 'image/png' })
      const dropzone = screen.getByText(/drag & drop/i).closest('.dropzone')
      
      fireEvent.drop(dropzone!, {
        dataTransfer: {
          files: [file],
        },
      })
      
      await waitFor(() => {
        expect(screen.getByText('test.png')).toBeInTheDocument()
      })
    })
  })
})
