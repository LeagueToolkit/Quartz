import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	Box,
	Typography,
	Button,
	Select,
	MenuItem,
	FormControl,
	InputLabel,
	Slider,
	Switch,
	FormControlLabel,
	Card,
	CardContent,
	useTheme,
	useMediaQuery,
	IconButton,
	Tooltip,
	Chip,
	Divider,
	Modal,
} from '@mui/material';
import {
	Image as ImageIcon,
	Settings as SettingsIcon,
	Folder as FolderIcon,
	RocketLaunch as RocketIcon,
	Compare as CompareIcon,
	CompareArrows as CompareArrowsIcon,
	ArrowForward as ArrowIcon,
	CloudDownload as DownloadIcon,
	PhotoSizeSelectActual as ScaleIcon,
	AutoAwesome as AIIcon,
	Refresh as RefreshIcon,
	CheckCircle as CheckIcon,
	Error as ErrorIcon,
	Info as InfoIcon,
	ZoomIn as ZoomInIcon,
	ZoomOut as ZoomOutIcon,
	RestartAlt as ResetIcon,
	Upload as UploadIcon,
	AutoAwesome as SparklesIcon,
	Autorenew as LoaderIcon,
	FolderOpen as FolderOpenIcon,
	Maximize as MaximizeIcon,
	Close as CloseIcon,
} from '@mui/icons-material';
import { CircularProgress } from '@mui/material';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
const nodePath = window.require ? window.require('path') : null;
const nodeFs = window.require ? window.require('fs') : null;

const Upscale = () => {
	const [exePath, setExePath] = useState('');
	const [isEnsuring, setIsEnsuring] = useState(false);
	const [ensureError, setEnsureError] = useState('');

	// Add CSS animation for pulse effect
	useEffect(() => {
		const style = document.createElement('style');
		style.textContent = `
			@keyframes pulse {
				0% { opacity: 1; transform: scale(1); }
				50% { opacity: 0.5; transform: scale(1.05); }
				100% { opacity: 1; transform: scale(1); }
			}
			@keyframes spin {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(style);
		return () => document.head.removeChild(style);
	}, []);

	const [inputPath, setInputPath] = useState('');
	const [outputDir, setOutputDir] = useState('');
	const [scale, setScale] = useState(4);
	const [model, setModel] = useState('upscayl-standard-4x');
	const [extraArgs, setExtraArgs] = useState('');
	const [batchMode, setBatchMode] = useState(false);

	const [isRunning, setIsRunning] = useState(false);
	const [progress, setProgress] = useState(0);
	const [log, setLog] = useState('');
	const logRef = useRef(null);
	const [shouldCancel, setShouldCancel] = useState(false);

	// Download manager state
	const [downloadStatus, setDownloadStatus] = useState(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [downloadMessage, setDownloadMessage] = useState('');
	const [showDownloadModal, setShowDownloadModal] = useState(false);

	// Batch processing state
	const [batchInfo, setBatchInfo] = useState(null);
	const [batchProgress, setBatchProgress] = useState({
		currentFile: 0,
		totalFiles: 0,
		currentFileName: '',
		overallProgress: 0,
		fileProgress: 0
	});
	const [batchResults, setBatchResults] = useState(null);

	// Folder preview state
	const [folderContents, setFolderContents] = useState([]);

	// Preview state
	const [previewImage, setPreviewImage] = useState(null);
	const [upscaledImage, setUpscaledImage] = useState(null);
	const [sliderPosition, setSliderPosition] = useState(50);
	const [isDragging, setIsDragging] = useState(false);
	const [zoomLevel, setZoomLevel] = useState(100);

	// Ensure original and upscaled images render at exactly the same size
	const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
	const MAX_PREVIEW_W = 900;
	const MAX_PREVIEW_H = 650;

	const handleOriginalLoad = (e) => {
		try {
			const naturalWidth = e?.target?.naturalWidth || 0;
			const naturalHeight = e?.target?.naturalHeight || 0;
			if (naturalWidth && naturalHeight) {
				const scale = Math.min(MAX_PREVIEW_W / naturalWidth, MAX_PREVIEW_H / naturalHeight, 1.0) || 1.0;
				const width = Math.round(naturalWidth * scale);
				const height = Math.round(naturalHeight * scale);
				setDisplaySize({ width, height });
			}
		} catch { }
	};

	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('md'));

	// ─── Modern style helpers ──────────────────────────────────────────────────
	const panelSx = {
		background: 'rgba(255,255,255,0.02)',
		backdropFilter: 'blur(12px)',
		border: '1px solid rgba(255,255,255,0.06)',
		borderRadius: '16px',
		p: { xs: 1.25, sm: 1.5 },
		position: 'relative',
		overflow: 'hidden',
		'&::before': {
			content: '""',
			position: 'absolute',
			top: 0, left: '20%', right: '20%', height: '1px',
			background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
			pointerEvents: 'none',
		},
	};

	const inputSx = {
		'& .MuiOutlinedInput-root': {
			background: 'rgba(255,255,255,0.03)',
			color: 'var(--text)',
			fontSize: '0.8rem',
			borderRadius: '8px',
			'& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
			'&:hover fieldset': { borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)' },
			'&.Mui-focused fieldset': { borderColor: 'var(--accent)', borderWidth: '1px' },
		},
		'& .MuiInputBase-input': {
			color: 'var(--text)',
			'&::placeholder': { color: 'rgba(255,255,255,0.25)', opacity: 1 },
		},
	};

	const selectSx = {
		...inputSx,
		'& .MuiOutlinedInput-root': {
			...inputSx['& .MuiOutlinedInput-root'],
			height: '38px',
		},
		'& .MuiSelect-select': {
			py: 1,
			display: 'flex',
			alignItems: 'center',
		}
	};

	const modePillSx = (active) => ({
		px: 1.35, py: 0.45,
		borderRadius: '6px',
		cursor: 'pointer',
		fontSize: '0.7rem',
		fontWeight: 600,
		letterSpacing: '0.02em',
		background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
		color: active ? 'var(--accent)' : 'rgba(255,255,255,0.28)',
		border: active ? '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' : '1px solid transparent',
		transition: 'all 0.18s ease',
		userSelect: 'none',
		'&:hover': { color: active ? 'var(--accent)' : 'rgba(255,255,255,0.5)' },
	});

	const buttonSx = {
		width: '100%',
		background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
		border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
		color: 'var(--accent)',
		fontWeight: 700,
		fontSize: '0.8rem',
		textTransform: 'none',
		borderRadius: '10px',
		py: 1,
		transition: 'all 0.2s ease',
		'&:hover': {
			background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
			borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
			transform: 'translateY(-1px)'
		},
		'&:disabled': { opacity: 0.5, transform: 'none', cursor: 'not-allowed' }
	};

	const primaryButtonSx = {
		...buttonSx,
		background: 'var(--accent) !important',
		color: '#000 !important',
		'&:hover': {
			background: 'var(--accent)',
			filter: 'brightness(1.15)',
			transform: 'translateY(-1.5px)',
			boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
		},
		'&.Mui-disabled': {
			background: 'rgba(255,255,255,0.06) !important',
			color: 'rgba(255,255,255,0.25) !important',
			border: '1px solid rgba(255,255,255,0.02) !important',
			opacity: 1
		}
	};

	const sliderSx = {
		color: 'var(--accent)',
		height: 4,
		'& .MuiSlider-thumb': {
			width: 12,
			height: 12,
			transition: '0.3s cubic-bezier(.47,1.64,.41,.8)',
			'&:before': { boxShadow: '0 2px 12px 0 rgba(0,0,0,0.4)' },
			'&:hover, &.Mui-focusVisible': { boxShadow: '0px 0px 0px 8px color-mix(in srgb, var(--accent) 16%, transparent)' },
			'&.Mui-active': { width: 16, height: 16 },
		},
		'& .MuiSlider-rail': { opacity: 0.15 },
	};

	useEffect(() => {
		if (!ipcRenderer) return;
		let mounted = true;
		(async () => {
			try {
				const saved = await ipcRenderer.invoke('prefs:get', 'RealesrganExePath');
				if (mounted && saved) setExePath(saved);
			} catch { }
		})();
		const onLog = (_e, data) => {
			setLog((prev) => (prev ? prev + data : data));
		};
		const onProgress = (_e, progress) => {
			console.log('Received progress update:', progress);
			setProgress(progress);
		};
		const onDownloadProgress = (_e, data) => {
			console.log('Received download progress:', data);
			if (mounted) {
				setDownloadProgress(data.progress || 0);
				setDownloadMessage(data.message || '');
			}
		};

		// Batch processing event listeners
		const onBatchStart = (_e, data) => {
			console.log('Batch processing started:', data);
			if (mounted) {
				setBatchInfo(data);
				setBatchProgress({
					currentFile: 0,
					totalFiles: data.totalFiles,
					currentFileName: '',
					overallProgress: 0,
					fileProgress: 0
				});
			}
		};

		const onBatchProgress = (_e, data) => {
			console.log('Batch progress update:', data);
			if (mounted) {
				setBatchProgress(data);
			}
		};

		const onBatchComplete = (_e, data) => {
			console.log('Batch processing complete:', data);
			if (mounted) {
				setBatchResults(data);
				setIsRunning(false);


			}
		};

		ipcRenderer.on('upscayl:log', onLog);
		ipcRenderer.on('upscayl:progress', onProgress);
		ipcRenderer.on('upscale:progress', onDownloadProgress);
		ipcRenderer.on('upscale:log', onLog); // Use same handler for download logs
		ipcRenderer.on('upscayl:batch-start', onBatchStart);
		ipcRenderer.on('upscayl:batch-progress', onBatchProgress);
		ipcRenderer.on('upscayl:batch-complete', onBatchComplete);

		return () => {
			mounted = false;
			try { ipcRenderer.removeListener('upscayl:log', onLog); } catch { }
			try { ipcRenderer.removeListener('upscayl:progress', onProgress); } catch { }
			try { ipcRenderer.removeListener('upscale:progress', onDownloadProgress); } catch { }
			try { ipcRenderer.removeListener('upscale:log', onLog); } catch { }
			try { ipcRenderer.removeListener('upscayl:batch-start', onBatchStart); } catch { }
			try { ipcRenderer.removeListener('upscayl:batch-progress', onBatchProgress); } catch { }
			try { ipcRenderer.removeListener('upscayl:batch-complete', onBatchComplete); } catch { }
		};
	}, []);

	// Check download status on mount
	useEffect(() => {
		checkDownloadStatus();
	}, []);

	useEffect(() => {
		try {
			if (logRef.current) {
				logRef.current.scrollTop = logRef.current.scrollHeight;
			}
		} catch { }
	}, [log]);

	// Load preview image when input path changes (file:// first, data URL fallback)
	useEffect(() => {
		try {
			if (inputPath && nodeFs?.existsSync(inputPath)) {
				const buffer = nodeFs.readFileSync(inputPath);
				const ext = (inputPath.split('.').pop() || '').toLowerCase();
				const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
					: ext === 'bmp' ? 'image/bmp'
						: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
							: 'image/png';
				const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
				setPreviewImage(dataUrl);
			} else {
				setPreviewImage(null);
			}
			setUpscaledImage(null);
		} catch {
			setPreviewImage(null);
			setUpscaledImage(null);
		}
	}, [inputPath]);

	// Debug folder contents changes
	useEffect(() => {
		console.log('🔍 folderContents state changed:', folderContents.length, 'items');
		if (folderContents.length > 0) {
			console.log('🔍 First few items:', folderContents.slice(0, 3).map(f => f.name));
		}
	}, [folderContents]);

	// Global mouse event listener for slider dragging
	useEffect(() => {
		const handleGlobalMouseUp = () => {
			if (isDragging) {
				setIsDragging(false);
			}
		};

		if (isDragging) {
			document.addEventListener('mouseup', handleGlobalMouseUp);
			document.addEventListener('mouseleave', handleGlobalMouseUp);
		}

		return () => {
			document.removeEventListener('mouseup', handleGlobalMouseUp);
			document.removeEventListener('mouseleave', handleGlobalMouseUp);
		};
	}, [isDragging]);



	// Function to load folder contents for preview
	const loadFolderContents = async (folderPath) => {
		console.log('🔍 Loading folder contents for:', folderPath);
		if (!nodeFs || !nodePath) {
			console.error('❌ nodeFs or nodePath not available');
			return;
		}

		try {
			const supportedExtensions = ['.png', '.jpg', '.jpeg', '.jfif', '.bmp', '.tif', '.tiff'];
			const contents = [];

			console.log('🔍 Reading directory:', folderPath);
			const files = nodeFs.readdirSync(folderPath);
			console.log('🔍 Found files:', files);

			for (const file of files) {
				const filePath = nodePath.join(folderPath, file);
				console.log('🔍 Checking file:', filePath);
				const stat = nodeFs.statSync(filePath);

				if (stat.isFile()) {
					const ext = nodePath.extname(file).toLowerCase();
					console.log('🔍 File extension:', ext);
					if (supportedExtensions.includes(ext)) {
						console.log('🔍 Supported image file found:', file);
						// Create thumbnail data URL
						try {
							const buffer = nodeFs.readFileSync(filePath);
							const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
								: ext === 'bmp' ? 'image/bmp'
									: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
										: 'image/png';
							const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

							contents.push({
								name: file,
								path: filePath,
								thumbnail: dataUrl,
								size: stat.size
							});
							console.log('🔍 Added file with thumbnail:', file);
						} catch (e) {
							console.log('🔍 Could not read file for thumbnail:', file, e);
							// If we can't read the file, just add it without thumbnail
							contents.push({
								name: file,
								path: filePath,
								thumbnail: null,
								size: stat.size
							});
						}
					} else {
						console.log('🔍 Skipping non-image file:', file);
					}
				} else {
					console.log('🔍 Skipping directory:', file);
				}
			}

			// Sort by name
			contents.sort((a, b) => a.name.localeCompare(b.name));
			console.log('🔍 Final folder contents:', contents.length, 'images');
			setFolderContents(contents);

		} catch (error) {
			console.error('❌ Error loading folder contents:', error);
			setFolderContents([]);
		}
	};

	const pickInput = async () => {
		console.log('🔍 pickInput called, batchMode:', batchMode);
		if (!ipcRenderer) return;

		if (batchMode) {
			console.log('🔍 Batch mode: opening directory dialog');
			// Batch mode: select folder
			const res = await ipcRenderer.invoke('dialog:openDirectory');
			console.log('🔍 Directory dialog result:', res);
			if (!res.canceled && res.filePaths?.[0]) {
				const selectedPath = res.filePaths[0];
				console.log('🔍 Selected folder path:', selectedPath);
				setInputPath(selectedPath);

				// Load folder contents for preview
				console.log('🔍 Calling loadFolderContents...');
				await loadFolderContents(selectedPath);

				// Automatically set output folder to a subfolder of the selected folder
				if (nodePath) {
					const outputDir = nodePath.join(selectedPath, 'upscaled');
					setOutputDir(outputDir);
					console.log('🔍 Set output directory:', outputDir);
				}
			}
		} else {
			// Single file mode: select image file
			const res = await ipcRenderer.invoke('dialog:openFile', {
				filters: [
					{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'tif', 'tiff'] },
					{ name: 'All Files', extensions: ['*'] },
				],
			});
			if (!res.canceled && res.filePaths?.[0]) {
				const selectedPath = res.filePaths[0];
				setInputPath(selectedPath);

				// Clear folder contents for single file mode
				setFolderContents([]);

				// Automatically set output folder to the same directory as the input image
				if (nodePath) {
					const outputDir = nodePath.dirname(selectedPath);
					setOutputDir(outputDir);
				}
			}
		}
	};

	const pickOutput = async () => {
		if (!ipcRenderer) return;
		const res = await ipcRenderer.invoke('dialog:openDirectory');
		if (!res.canceled && res.filePaths?.[0]) setOutputDir(res.filePaths[0]);
	};

	// Download manager functions
	const checkDownloadStatus = async () => {
		if (!ipcRenderer) return;
		try {
			const status = await ipcRenderer.invoke('upscale:check-status');
			setDownloadStatus(status);
		} catch (error) {
			console.error('Failed to check download status:', error);
		}
	};

	const startDownload = async () => {
		if (!ipcRenderer) return;
		setIsDownloading(true);
		setDownloadProgress(0);
		setDownloadMessage('Starting download...');
		setLog(''); // Clear previous logs

		try {
			await ipcRenderer.invoke('upscale:download-all');
		} catch (error) {
			console.error('Download failed:', error);
			setDownloadMessage('Download failed');
		} finally {
			setIsDownloading(false);
			setDownloadMessage('');
			// Refresh status after download
			await checkDownloadStatus();
		}
	};

	const ensureUpscayl = async () => {
		if (!ipcRenderer) return;
		setIsEnsuring(true);
		setEnsureError('');
		setLog('');
		try {
			console.log('🔍 Calling realesrgan.ensure...');
			const path = await ipcRenderer.invoke('realesrgan.ensure');
			console.log('🔍 Got path from realesrgan.ensure:', path);

			if (path) {
				setExePath(path);
				console.log('🔍 Saving path to preferences:', path);
				await ipcRenderer.invoke('prefs:set', 'RealesrganExePath', path);
			} else {
				// No executable found - user needs to download it
				setExePath('');
				setEnsureError('Upscayl binary not found. Please download it from the AI Components Settings in the top right corner.');
			}
		} catch (e) {
			const msg = String(e?.message || e);
			if (msg.includes("No handler registered")) {
				setEnsureError('Upscayl service not loaded yet. Please fully restart Quartz (close the Electron window and re-run) so the new integration is registered.\n\nDetails: ' + msg);
			} else {
				setEnsureError(msg);
			}
		} finally {
			setIsEnsuring(false);
		}
	};

	const cancelUpscaling = async () => {
		setShouldCancel(true);
		setProgress(0);
		setLog('');

		// Cancel the upscaling process
		if (ipcRenderer) {
			try {
				await ipcRenderer.invoke('upscayl:cancel');
			} catch (e) {
				console.error('Error canceling upscaling:', e);
			}
		}

		// Set running to false after canceling
		setIsRunning(false);
	};

	const startUpscale = async () => {
		if (!ipcRenderer || !exePath) {
			console.error('Missing ipcRenderer or exePath');
			return;
		}

		// Validate required inputs before starting
		if (!inputPath) {
			console.error('No input path selected');
			return;
		}

		console.log('🔍 Starting upscale with exePath:', exePath);
		setIsRunning(true);
		setShouldCancel(false);
		setProgress(0);
		setLog('');
		setBatchInfo(null);
		setBatchProgress({
			currentFile: 0,
			totalFiles: 0,
			currentFileName: '',
			overallProgress: 0,
			fileProgress: 0
		});
		setBatchResults(null);

		try {
			console.log('🔍 Batch mode:', batchMode);
			console.log('🔍 Input path:', inputPath);
			console.log('🔍 Output dir:', outputDir);

			if (batchMode) {
				// Batch processing mode
				console.log('🔍 Starting batch processing...');

				// Validate that input is a directory
				if (!nodeFs?.existsSync(inputPath) || !nodeFs.lstatSync(inputPath).isDirectory()) {
					throw new Error('Batch mode requires a folder to be selected');
				}

				// Validate output directory
				if (!outputDir) {
					throw new Error('Please select an output folder for batch processing');
				}

				// Call batch processing
				const results = await ipcRenderer.invoke('upscayl:batch-process', {
					inputFolder: inputPath,
					outputFolder: outputDir,
					model,
					scale,
					extraArgs,
					exePath
				});

				console.log('✅ Batch processing completed:', results);

			} else {
				// Single file processing mode
				const args = [];
				if (inputPath) args.push('-i', inputPath);

				let resolvedOutput = outputDir;
				try {
					const inputExists = nodeFs?.existsSync(inputPath);
					const outputExists = resolvedOutput ? nodeFs?.existsSync(resolvedOutput) : false;
					const inputIsDir = inputExists ? nodeFs.lstatSync(inputPath).isDirectory() : false;
					const outputIsDir = outputExists ? nodeFs.lstatSync(resolvedOutput).isDirectory() : (!nodePath?.extname(resolvedOutput));

					if (!inputIsDir) {
						if (!resolvedOutput) {
							const ext = nodePath?.extname(inputPath) || '.png';
							const base = nodePath?.basename(inputPath, ext) || 'upscaled';
							const dir = nodePath?.dirname(inputPath) || '';
							resolvedOutput = nodePath ? nodePath.join(dir, `${base}_x${scale}${ext}`) : `${inputPath}_x${scale}`;
						} else if (outputIsDir) {
							const ext = nodePath?.extname(inputPath) || '.png';
							const base = nodePath?.basename(inputPath, ext) || 'upscaled';
							resolvedOutput = nodePath ? nodePath.join(resolvedOutput, `${base}_x${scale}${ext}`) : `${resolvedOutput}/${base}_x${scale}${ext}`;
						}
					} else {
						if (resolvedOutput && !outputIsDir) {
							throw new Error('Input is a folder, but output is a file. Please choose an output folder.');
						}
					}
				} catch (shapeErr) {
					console.error('Output path resolution error:', shapeErr);
					setLog((prev) => prev + `\n${String(shapeErr?.message || shapeErr)}`);
					setIsRunning(false);
					return;
				}

				if (resolvedOutput) args.push('-o', resolvedOutput);
				if (scale) args.push('-s', String(scale));
				if (model) args.push('-n', model);
				if (extraArgs && extraArgs.trim().length) {
					args.push(...extraArgs.split(' ').filter(Boolean));
				}

				const exeDir = nodePath ? nodePath.dirname(exePath) : undefined;

				// Use streaming upscaling for real-time progress
				const { code, stdout, stderr } = await ipcRenderer.invoke('upscayl:stream', {
					exePath: exePath,
					args,
					cwd: exeDir,
				});

				setLog((prev) => prev + (stdout || '') + (stderr || ''));
				setProgress(code === 0 ? 100 : 0);

				// Load upscaled image for preview if successful
				if (code === 0 && resolvedOutput && nodeFs?.existsSync(resolvedOutput)) {
					try {
						const buffer = nodeFs.readFileSync(resolvedOutput);
						const ext = (resolvedOutput.split('.').pop() || '').toLowerCase();
						const mime = ext === 'jpg' || ext === 'jpeg' || ext === 'jfif' ? 'image/jpeg'
							: ext === 'bmp' ? 'image/bmp'
								: ext === 'tif' || ext === 'tiff' ? 'image/tiff'
									: 'image/png';
						const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
						setUpscaledImage(dataUrl);
					} catch {
						setUpscaledImage(null);
					}
				}
			}
		} catch (e) {
			console.error('Upscaling error:', e);
			const errorMessage = e?.message || String(e) || 'Unknown error occurred';
			setLog((prev) => prev + '\n❌ Error: ' + errorMessage);
			setIsRunning(false);
		} finally {
			setIsRunning(false);
		}
	};

	const handleSliderChange = (event, newValue) => {
		setSliderPosition(newValue);
	};

	const handleSliderMouseDown = () => {
		setIsDragging(true);
	};

	const handleSliderMouseUp = () => {
		setIsDragging(false);
	};

	const handleMouseMove = (event) => {
		if (!isDragging || !upscaledImage) return;

		const container = event.currentTarget;
		const rect = container.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
		setSliderPosition(percentage);
	};

	const handleZoomIn = () => {
		setZoomLevel(prev => Math.min(prev + 25, 200));
	};

	const handleZoomOut = () => {
		setZoomLevel(prev => Math.max(prev - 25, 25));
	};

	const handleResetZoom = () => {
		setZoomLevel(100);
	};





	const availableModels = [
		{ value: 'upscayl-standard-4x', label: 'Upscayl Standard' },
		{ value: 'upscayl-lite-4x', label: 'Upscayl Lite' },
		{ value: 'ultrasharp-4x', label: 'UltraSharp' },
		{ value: 'remacri-4x', label: 'Remacri' },
		{ value: 'digital-art-4x', label: 'Digital Art' },
		{ value: 'high-fidelity-4x', label: 'High Fidelity' },
		{ value: 'ultramix-balanced-4x', label: 'UltraMix Balanced' },
	];

	// Removed early return empty state so the sidebar is always visible

	// Modern Processing Modal
	const runningModal = (
		<Box sx={{
			position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
			zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3
		}}>
			<Box sx={{
				width: '100%', maxWidth: 480,
				background: 'rgba(15, 15, 20, 0.98)',
				backdropFilter: 'blur(30px)',
				border: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px',
				overflow: 'hidden', boxShadow: '0 42px 100px rgba(0,0,0,0.9)',
				position: 'relative'
			}}>
				{/* Modal Header */}
				<Box sx={{
					p: 2.2, borderBottom: '1px solid rgba(255,255,255,0.08)',
					display: 'flex', alignItems: 'center', justifyContent: 'space-between',
					background: 'rgba(255,255,255,0.02)'
				}}>
					<Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: 'var(--accent)' }}>
						AI PROCESSING IN PROGRESS
					</Typography>
					<IconButton size="small" onClick={cancelUpscaling} sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: '#f87171' } }}>
						<CloseIcon sx={{ fontSize: 18 }} />
					</IconButton>
				</Box>

				{/* Modal Content */}
				<Box sx={{ p: 4, textAlign: 'center' }}>
					{/* Animated Loader */}
					<Box sx={{
						width: 84, height: 84, mx: 'auto', mb: 3.5, position: 'relative',
						display: 'flex', alignItems: 'center', justifyContent: 'center'
					}}>
						<Box sx={{
							position: 'absolute', inset: 0, borderRadius: '50%',
							background: 'linear-gradient(135deg, var(--accent), var(--accent-bright))',
							opacity: 0.15, animation: 'pulse 2s infinite'
						}} />
						<CircularProgress
							variant="determinate"
							value={batchMode ? batchProgress.overallProgress : progress}
							size={84}
							thickness={2.5}
							sx={{ color: 'var(--accent)', position: 'absolute' }}
						/>
						<LoaderIcon sx={{ fontSize: 32, color: 'var(--accent)', animation: 'spin 2s linear infinite' }} />
					</Box>

					<Typography sx={{ fontWeight: 700, fontSize: '1.2rem', mb: 1 }}>
						{batchMode ? `${batchProgress.currentFile} of ${batchProgress.totalFiles} Files` : 'Enhancing Image'}
					</Typography>
					<Typography sx={{ fontSize: '0.8rem', color: 'var(--text-2)', opacity: 0.6, mb: 4, px: 2, lineHeight: 1.5 }}>
						{batchMode ? (
							<>Currently processing: <Box component="span" sx={{ color: 'var(--accent)', fontWeight: 600 }}>{batchProgress.currentFileName}</Box></>
						) : (
							`AI is upscaling your image by ${scale}x. This may take a minute depending on your hardware.`
						)}
					</Typography>

					{/* Progress Indicators */}
					<Box sx={{ mb: 4 }}>
						{batchMode ? (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
								<Box>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
										<Typography sx={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.4 }}>OVERALL PROGRESS</Typography>
										<Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)' }}>{batchProgress.overallProgress}%</Typography>
									</Box>
									<Box sx={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
										<Box sx={{ width: `${batchProgress.overallProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease-out' }} />
									</Box>
								</Box>
								<Box>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
										<Typography sx={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.4 }}>CURRENT FILE</Typography>
										<Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent)' }}>{Math.round(batchProgress.fileProgress)}%</Typography>
									</Box>
									<Box sx={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}>
										<Box sx={{ width: `${batchProgress.fileProgress}%`, height: '100%', background: 'linear-gradient(90deg, rgba(255,255,255,0.2), var(--accent))', transition: 'width 0.3s' }} />
									</Box>
								</Box>
							</Box>
						) : (
							<Box>
								<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
									<Typography sx={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.4 }}>PROCESSING</Typography>
									<Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent)' }}>{Math.round(progress)}%</Typography>
								</Box>
								<Box sx={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden', p: '2px' }}>
									<Box sx={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.5s cubic-bezier(0.1, 0, 0.3, 1)' }} />
								</Box>
							</Box>
						)}
					</Box>

					<Button
						onClick={cancelUpscaling}
						variant="outlined"
						sx={{
							borderColor: 'rgba(239,68,68,0.2)', color: '#f87171',
							textTransform: 'none', fontSize: '0.75rem', fontWeight: 700,
							px: 4, borderRadius: '8px',
							'&:hover': { borderColor: '#ef4444', background: 'rgba(239,68,68,0.05)' }
						}}
					>
						Cancel Process
					</Button>
				</Box>
			</Box>
		</Box>
	);

	return (
		<Box className="upscale-root" sx={{
			height: '100%', minHeight: '100%', width: '100%',
			display: 'flex', flexDirection: 'column',
			background: 'var(--bg)', color: 'var(--text)',
			overflow: 'hidden', position: 'relative'
		}}>
			{/* ── Page header ── */}
			<Box sx={{
				flexShrink: 0,
				px: { xs: 2, sm: 2.5 }, py: { xs: 1.1, sm: 1.35 },
				borderBottom: '1px solid rgba(255,255,255,0.06)',
				display: 'flex', alignItems: 'center', gap: 1.5,
				position: 'relative', zIndex: 2,
				background: 'rgba(0,0,0,0.05)',
			}}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.2 }}>
						AI Image Upscaler
					</Typography>
					<Typography sx={{ fontSize: '0.67rem', color: 'var(--text-2)', opacity: 0.5, mt: 0.1, lineHeight: 1 }}>
						{batchMode ? 'Upscale multiple images from a folder' : 'Enhance a single image using AI models'}
					</Typography>
				</Box>

				{/* Batch mode toggle pills */}
				<Box sx={{ display: 'flex', gap: '3px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', p: '3px' }}>
					{[
						{ key: false, label: 'Single File' },
						{ key: true, label: 'Batch Mode' }
					].map(({ key, label }) => (
						<Box key={String(key)} onClick={() => setBatchMode(key)} sx={modePillSx(batchMode === key)}>{label}</Box>
					))}
				</Box>

				{/* Refresh + Settings */}
				<Box sx={{ display: 'flex', gap: 0.25, ml: 1 }}>
					<Tooltip title={!downloadStatus?.binary?.installed ? "Install AI Components" : "AI Settings"} arrow>
						<IconButton size="small"
							onClick={() => setShowDownloadModal(true)}
							sx={{
								color: downloadStatus?.binary?.installed ? 'rgba(255,255,255,0.35)' : '#f59e0b',
								'&:hover': { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }
							}}
						>
							<SettingsIcon sx={{ fontSize: 17 }} />
							{!downloadStatus?.binary?.installed && (
								<Box sx={{
									position: 'absolute', top: 6, right: 6, width: 6, height: 6,
									background: '#f59e0b', borderRadius: '50%', border: '1px solid var(--bg)',
									animation: 'pulse 2s infinite'
								}} />
							)}
						</IconButton>
					</Tooltip>
				</Box>
			</Box>

			{/* ── Body: sidebar + preview area ── */}
			<Box sx={{
				flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0,
				position: 'relative', zIndex: 1,
			}}>
				{/* Sidebar */}
				<Box sx={{
					width: { xs: '100%', sm: '300px', md: '320px' },
					flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.25,
					px: { xs: 1.5, sm: 2 }, py: 2,
					background: 'rgba(0,0,0,0.08)',
					backdropFilter: 'blur(10px)',
					borderRight: '1px solid rgba(255,255,255,0.06)',
					overflowY: 'auto',
					'&::-webkit-scrollbar': { width: 4 },
					'&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: 2 },
				}}>
					{/* Status Chip */}
					<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
						<Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', color: 'rgba(255,255,255,0.3)' }}>SYSTEM STATUS</Typography>
						<Chip
							label={exePath ? 'READY' : 'NOT INSTALLED'}
							size="small"
							sx={{
								height: 18, fontSize: '0.6rem', fontWeight: 800,
								background: exePath ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
								color: exePath ? '#4ade80' : '#f87171',
								border: `1px solid ${exePath ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
								'& .MuiChip-label': { px: 1 }
							}}
						/>
					</Box>

					{/* Step 1: Input */}
					<Box sx={panelSx}>
						<Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1.25, display: 'flex', alignItems: 'center', gap: 0.75 }}>
							{batchMode ? <FolderIcon sx={{ fontSize: 13 }} /> : <UploadIcon sx={{ fontSize: 13 }} />} {batchMode ? 'Source Folder' : 'Source Image'}
						</Typography>
						<Button onClick={pickInput} disabled={isRunning}
							startIcon={batchMode ? <FolderOpenIcon sx={{ fontSize: 15 }} /> : <UploadIcon sx={{ fontSize: 15 }} />}
							sx={buttonSx}
						>
							{inputPath ? 'Change Selection' : (batchMode ? 'Select Folder' : 'Select Image')}
						</Button>
						{inputPath && (
							<Box sx={{ mt: 1, px: 1, py: 0.75, borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
								<Typography sx={{ fontSize: '0.7rem', color: 'var(--text-2)', wordBreak: 'break-all', opacity: 0.8, lineHeight: 1.2 }}>
									{nodePath ? nodePath.basename(inputPath) : inputPath}
								</Typography>
							</Box>
						)}
					</Box>

					{/* Step 2: Model Configuration */}
					<Box sx={panelSx}>
						<Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
							<RocketIcon sx={{ fontSize: 13 }} /> Model Configuration
						</Typography>

						<FormControl fullWidth size="small" sx={{ mb: 1.5, ...selectSx }}>
							<Select value={model} onChange={(e) => setModel(e.target.value)}>
								{availableModels.map((m) => (
									<MenuItem key={m.value} value={m.value} sx={{ fontSize: '0.8rem', fontFamily: 'inherit' }}>{m.label}</MenuItem>
								))}
							</Select>
						</FormControl>

						<Box sx={{ px: 0.5 }}>
							<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
								<Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>UPSCALE SCALE</Typography>
								<Typography sx={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>{scale}x</Typography>
							</Box>
							<Slider value={scale} onChange={(e, v) => setScale(v)} min={1} max={4} step={1} marks sx={sliderSx} />
						</Box>
					</Box>

					{/* Step 3: Output */}
					<Box sx={panelSx}>
						<Typography sx={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85, mb: 1.25, display: 'flex', alignItems: 'center', gap: 0.75 }}>
							<FolderIcon sx={{ fontSize: 13 }} /> Destination
						</Typography>
						<Button onClick={pickOutput} disabled={isRunning}
							startIcon={<FolderOpenIcon sx={{ fontSize: 15 }} />}
							sx={buttonSx}
						>
							{outputDir ? 'Change Folder' : 'Set Output Folder'}
						</Button>
						{outputDir && (
							<Box sx={{ mt: 1, px: 1, py: 0.75, borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
								<Typography sx={{ fontSize: '0.65rem', color: 'var(--text-2)', wordBreak: 'break-all', opacity: 0.6, lineHeight: 1.3 }}>
									{outputDir}
								</Typography>
							</Box>
						)}
					</Box>

					<Box sx={{ mt: 'auto', pt: 1 }}>
						<Button
							fullWidth
							onClick={startUpscale}
							disabled={!exePath || !inputPath || !outputDir || isRunning}
							startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <SparklesIcon sx={{ fontSize: 16 }} />}
							sx={primaryButtonSx}
						>
							{isRunning ? 'UPSCAlING...' : 'START UPSCALING'}
						</Button>

						{ensureError && (
							<Typography sx={{ mt: 1.5, fontSize: '0.65rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', p: 1, borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)', lineHeight: 1.4 }}>
								{ensureError}
							</Typography>
						)}
					</Box>
				</Box>

				{/* Preview Area */}
				<Box sx={{
					flex: 1, display: 'flex', flexDirection: 'column',
					position: 'relative', background: 'rgba(0,0,0,0.15)',
					overflow: 'hidden'
				}}>
					{/* Small Preview Toolbar */}
					<Box sx={{
						px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
						borderBottom: '1px solid rgba(255,255,255,0.03)', background: 'rgba(0,0,0,0.05)',
						zIndex: 5
					}}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
							<IconButton size="small" onClick={handleZoomOut} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
								<ZoomOutIcon sx={{ fontSize: 18 }} />
							</IconButton>
							<Typography sx={{ minWidth: 45, textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', fontFamily: 'JetBrains Mono, monospace' }}>
								{zoomLevel}%
							</Typography>
							<IconButton size="small" onClick={handleZoomIn} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
								<ZoomInIcon sx={{ fontSize: 18 }} />
							</IconButton>
							<IconButton size="small" onClick={handleResetZoom} sx={{ ml: 1, color: 'rgba(255,255,255,0.4)', '&:hover': { color: 'var(--accent)' } }}>
								<ResetIcon sx={{ fontSize: 17 }} />
							</IconButton>
						</Box>

						{upscaledImage && (
							<Typography sx={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.05em', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', px: 1, py: 0.3, borderRadius: '4px' }}>
								AI ENHANCED COMPARISON
							</Typography>
						)}
					</Box>

					{/* Comparison Content */}
					<Box sx={{
						flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
						position: 'relative', overflow: 'auto', p: 4,
						'&::-webkit-scrollbar': { width: 6, height: 6 },
						'&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.05)', borderRadius: 3 },
					}}>
						{!previewImage && !isRunning && !batchMode && (
							<Box sx={{ textAlign: 'center', color: 'var(--text)' }}>
								<Box sx={{
									width: 96,
									height: 96,
									background: 'rgba(255,255,255,0.05)',
									border: '1px solid rgba(255,255,255,0.1)',
									borderRadius: '50%',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									mx: 'auto', mb: 3
								}}>
									<ImageIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)' }} />
								</Box>
								<Typography sx={{ mb: 1, color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '1rem' }}>No Image Selected</Typography>
								<Typography sx={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>Select an image from the sidebar to get started</Typography>
							</Box>
						)}

						{/* Batch Mode Folder Preview */}
						{batchMode && inputPath && folderContents.length > 0 && !isRunning && (
							<Box sx={{ width: '100%', height: '100%', p: 2, overflow: 'auto' }}>
								<Typography sx={{ mb: 2, fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
									SOURCE FOLDER: {folderContents.length} IMAGES
								</Typography>
								<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}>
									{folderContents.map((file, idx) => (
										<Box key={idx} sx={{
											background: 'rgba(255,255,255,0.03)', p: 1, borderRadius: '8px',
											border: '1px solid rgba(255,255,255,0.05)',
											'&:hover': { borderColor: 'rgba(255,255,255,0.15)', transform: 'translateY(-2px)' },
											transition: 'all 0.2s ease'
										}}>
											{file.thumbnail ? (
												<img src={file.thumbnail} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: '4px' }} alt="" />
											) : (
												<Box sx={{ width: '100%', height: 100, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
													<ImageIcon sx={{ opacity: 0.1 }} />
												</Box>
											)}
											<Typography noWrap sx={{ mt: 0.75, fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{file.name}</Typography>
										</Box>
									))}
								</Box>
							</Box>
						)}

						{/* Single File Preview */}
						{previewImage && !batchMode && (
							<Box sx={{ position: 'relative', transform: `scale(${zoomLevel / 100})`, transition: 'transform 0.3s ease' }}>
								<Box sx={{ position: 'relative', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onMouseMove={handleMouseMove} onMouseLeave={() => setIsDragging(false)}>
									<img src={previewImage} draggable={false} style={{ maxWidth: displaySize.width || '900px', maxHeight: displaySize.height || '650px', display: 'block' }} alt="" onLoad={handleOriginalLoad} />
									{upscaledImage && (
										<Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', clipPath: `inset(0 0 0 ${sliderPosition}%)` }}>
											<img src={upscaledImage} draggable={false} style={{ maxWidth: displaySize.width || '900px', maxHeight: displaySize.height || '650px', display: 'block' }} alt="" />
										</Box>
									)}
									{upscaledImage && (
										<Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${sliderPosition}%`, width: 1.5, background: 'var(--accent)', cursor: 'col-resize', transform: 'translateX(-50%)', zIndex: 3 }} onMouseDown={handleSliderMouseDown}>
											<Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '2px solid rgba(0,0,0,0.2)' }}>
												<CompareIcon sx={{ fontSize: 16 }} />
											</Box>
										</Box>
									)}
								</Box>
							</Box>
						)}
					</Box>
				</Box>
			</Box>

			{/* Download/Settings Modal */}
			{showDownloadModal && (
				<Box sx={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
					<Box sx={{
						width: '100%', maxWidth: 460,
						background: 'rgba(15, 15, 20, 0.98)',
						backdropFilter: 'blur(30px)',
						border: '1px solid rgba(255,255,255,0.08)', borderRadius: '24px',
						overflow: 'hidden', boxShadow: '0 42px 100px rgba(0,0,0,0.9)'
					}}>
						<Box sx={{ p: 2.2, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
							<Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: 'var(--accent)' }}>AI COMPONENTS SETTINGS</Typography>
							<IconButton size="small" onClick={() => setShowDownloadModal(false)} sx={{ color: 'rgba(255,255,255,0.3)' }}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
						</Box>
						<Box sx={{ p: 2.5 }}>
							<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
								<Box>
									<Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>Upscayl Binary</Typography>
									<Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', mt: 0.2 }}>Required for AI processing</Typography>
								</Box>
								<Chip label={downloadStatus?.binary?.installed ? 'INSTALLED' : 'MISSING'} size="small" sx={{ background: downloadStatus?.binary?.installed ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: downloadStatus?.binary?.installed ? '#4ade80' : '#f59e0b', fontSize: '0.62rem', fontWeight: 800 }} />
							</Box>

							{isDownloading && (
								<Box sx={{ mb: 2.5 }}>
									<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
										<Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{downloadMessage}</Typography>
										<Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{Math.round(downloadProgress)}%</Typography>
									</Box>
									<Box sx={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
										<Box sx={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
									</Box>
								</Box>
							)}

							<Button fullWidth onClick={startDownload} disabled={isDownloading || (downloadStatus?.binary?.installed && downloadStatus?.models?.installed?.length === downloadStatus?.models?.total)} sx={primaryButtonSx}>
								{isDownloading ? 'DOWNLOADING...' : (downloadStatus?.binary?.installed ? 'UPDATE COMPONENTS' : 'DOWNLOAD COMPONENTS (~200MB)')}
							</Button>
						</Box>
					</Box>
				</Box>
			)}

			{/* Upscaling Running Modal */}
			{isRunning && runningModal}
		</Box>
	);
};

export default Upscale;


