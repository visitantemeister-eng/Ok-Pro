/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CharacterImage, DictionaryRule } from '../types';
import { 
  X, 
  FolderLock, 
  FolderOpen, 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Upload, 
  Check, 
  ChevronRight, 
  Users, 
  Sparkles, 
  Search,
  Tag,
  AlertCircle,
  HelpCircle,
  Loader2,
  Video as VideoIcon,
  FileJson,
  FileText,
  Download,
  FolderUp,
  Layers,
  FileStack,
  CheckCircle2,
  HardDriveDownload,
  PackageOpen
} from 'lucide-react';

interface KhoAnhModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: CharacterImage[];
  onImagesLoaded: (loadedImages: CharacterImage[], skipRemap?: boolean) => void;
  onDeleteImage: (id: string) => void;
  onDeleteCharacter?: (charName: string) => void;
  dictionary?: DictionaryRule[];
  onUpdateDictionary?: (rules: DictionaryRule[]) => void;
  backgroundNames?: string[];
  onUpdateBackgroundNames?: (names: string[]) => void;
}

// Resizer and optimizer for canvas image uploads - preserves original/standard size while compressing
const compressAndResizeImage = (file: File): Promise<{ blob: Blob; url: string }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        let w = img.width;
        let h = img.height;
        const maxDim = 1920;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const url = URL.createObjectURL(file);
          resolve({ blob: file, url });
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              resolve({ blob, url });
            } else {
              const url = URL.createObjectURL(file);
              resolve({ blob: file, url });
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => {
        const url = URL.createObjectURL(file);
        resolve({ blob: file, url });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      const url = URL.createObjectURL(file);
      resolve({ blob: file, url });
    };
    reader.readAsDataURL(file);
  });
};

// Resizer and compressor for video uploads - reduces resolution and bitrate to prevent browser loading lag
const compressAndResizeVideo = (
  file: File,
  mode: 'super' | 'balanced',
  onProgress?: (percent: number) => void
): Promise<{ blob: Blob; url: string }> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.currentTime = 0;
    
    video.onloadedmetadata = () => {
      let width = video.videoWidth;
      let height = video.videoHeight;
      const duration = video.duration || 1;
      
      const maxDim = mode === 'super' ? 480 : 720;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      if (width % 2 !== 0) width += 1;
      if (height % 2 !== 0) height += 1;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof canvas.captureStream !== 'function') {
        resolve({ blob: file, url: video.src });
        return;
      }
      
      const stream = canvas.captureStream(25); // Capture at 25 FPS
      const bitrate = mode === 'super' ? 400000 : 1200000; // Bitrate scale (400kbps or 1.2Mbs)
      
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }
      
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: bitrate,
      };
      if (selectedMimeType) {
        recorderOptions.mimeType = selectedMimeType;
      }
      
      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          chunks.push(evt.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        resolve({ blob, url });
        
        // Cleanup old source
        try {
          URL.revokeObjectURL(video.src);
        } catch (e) {}
      };
      
      let animFrameId: number;
      // Play at double speed to accelerate compression by 2x!
      video.playbackRate = 2.0;
      
      const drawFrame = () => {
        if (video.paused || video.ended) {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }
        
        ctx.drawImage(video, 0, 0, width, height);
        if (onProgress) {
          onProgress(Math.min(99, Math.round((video.currentTime / duration) * 100)));
        }
        animFrameId = requestAnimationFrame(drawFrame);
      };
      
      video.onplay = () => {
        recorder.start();
        drawFrame();
      };
      
      video.onended = () => {
        cancelAnimationFrame(animFrameId);
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };
      
      video.play().catch((err) => {
        console.warn("Play error during video compression:", err);
        resolve({ blob: file, url: video.src });
      });
    };
    
    video.onerror = () => {
      resolve({ blob: file, url: video.src });
    };
  });
};

// List of common English and Vietnamese stop words to ignore when extracting keywords from filenames
const STOP_WORDS = new Set([
  'at', 'of', 'and', 'the', 'with', 'or', 'in', 'to', 'on', 'by', 'for', 'an', 'is', 'it', 'about', 'from', 'as', 
  'this', 'that', 'these', 'those', 'then', 'here', 'there', 'who', 'whom', 'where', 'when', 'why', 'how', 'which',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'but', 'not', 'no', 'yes', 'so', 'if', 'your',
  'my', 'their', 'our', 'his', 'her', 'its', 'me', 'you', 'he', 'she', 'they', 'we', 'us', 'him', 'them',
  'cua', 'va', 'trong', 'cho', 'nhu', 'nhung', 'co', 'nay', 'do', 'kia', 'của', 'và', 'trong', 'cho', 'như', 'những', 'có', 'này', 'đó', 'kia',
  'gh', 'thì', 'là', 'mà', 'gì', 'nào', 'với', 'về', 'để', 'cũng', 'đã', 'đang', 'sẽ', 'được', 'từ', 'qua', 'bởi', 'tại', 'ra', 'vào', 'lên', 'xuống', 'lại', 'thêm'
]);

// Keyword extraction from filenames and relative pathways
const extractKeywords = (fileName: string, relativePath?: string): string[] => {
  const allKeywords = new Set<string>();

  const processSegment = (segment: string) => {
    const nameWithoutExt = segment.substring(0, segment.lastIndexOf('.')) || segment;
    const words = nameWithoutExt.split(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/i);
    words.forEach(w => {
      const trimmed = w.trim();
      if (trimmed.length >= 2 && !/^\d+$/.test(trimmed) && !STOP_WORDS.has(trimmed.toLowerCase())) {
        allKeywords.add(trimmed);
      }
    });
  };

  processSegment(fileName);

  if (relativePath) {
    const parts = relativePath.split('/');
    for (let i = 0; i < parts.length - 1; i++) {
      processSegment(parts[i]);
    }
  }

  return Array.from(allKeywords);
};

export default function KhoAnhModal({
  isOpen,
  onClose,
  images,
  onImagesLoaded,
  onDeleteImage,
  onDeleteCharacter,
  dictionary,
  onUpdateDictionary,
  backgroundNames = [],
  onUpdateBackgroundNames = () => {}
}: KhoAnhModalProps) {
  const [selectedChar, setSelectedChar] = useState<string>('Tất cả');
  const [newCharName, setNewCharName] = useState('');
  const [createdEmptyChars, setCreatedEmptyChars] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vsync_empty_chars');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading empty characters:', e);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vsync_empty_chars', JSON.stringify(createdEmptyChars));
    } catch (e) {
      console.error('Error saving empty characters:', e);
    }
  }, [createdEmptyChars]);

  const [isPending, startTransition] = useTransition();
  const [optimizeProgress, setOptimizeProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Tab view within the Kho Ảnh panel
  const [modalView, setModalView] = useState<'images' | 'dictionary'>('images');
  const activeAssetTab = 'images';
  const [showNewBgInput, setShowNewBgInput] = useState(false);
  const [newBgName, setNewBgName] = useState('');

  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    setIsRevealed(false);
  }, [selectedChar]);

  // Dictionary management states
  const [manualKeyword, setManualKeyword] = useState('');
  const [manualCharName, setManualCharName] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingKeyword, setEditingKeyword] = useState('');
  const [editingCharName, setEditingCharName] = useState('');
  const [dictSearchQuery, setDictSearchQuery] = useState('');
  const [newAliasKeyword, setNewAliasKeyword] = useState('');
  const [confirmDeleteChar, setConfirmDeleteChar] = useState<string | null>(null);

  // JSON / TXT Export & Import status
  const [showExportPartsModal, setShowExportPartsModal] = useState(false);
  const [partBatchSize, setPartBatchSize] = useState<number>(500);
  const [isExportingParts, setIsExportingParts] = useState(false);
  const [exportPartsProgress, setExportPartsProgress] = useState<{
    currentPart: number;
    totalParts: number;
    currentImageInPart: number;
    totalImagesInPart: number;
    processedTotalImages: number;
    totalImages: number;
    statusText: string;
  } | null>(null);
  const [generatedPartFiles, setGeneratedPartFiles] = useState<{
    part: number;
    totalParts: number;
    imageCount: number;
    fileName: string;
    blobUrl: string;
    sizeMb: string;
  }[]>([]);

  const [isImportingJson, setIsImportingJson] = useState(false);
  const [importBatchProgress, setImportBatchProgress] = useState<{
    currentFileIndex: number;
    totalFiles: number;
    currentFileName: string;
    currentImageInFile: number;
    totalImagesInFile: number;
    totalImagesLoadedSoFar: number;
  } | null>(null);

  // Pending batch state waiting for name input
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [charNamingInput, setCharNamingInput] = useState('');
  const [showNamingPrompt, setShowNamingPrompt] = useState(false);
  const [showNewCharInput, setShowNewCharInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dictFileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  const rules = dictionary || [];
  const setRules = onUpdateDictionary || (() => {});

  // Auto-sanitizer: If any rule keyword contains commas or semicolons (e.g. "Carly, Laura Wright"), automatically split into separate rules
  useEffect(() => {
    if (!dictionary || dictionary.length === 0) return;
    const hasUnsplit = dictionary.some(r => r.keyword && (r.keyword.includes(',') || r.keyword.includes(';')));
    if (hasUnsplit && onUpdateDictionary) {
      const sanitized: DictionaryRule[] = [];
      dictionary.forEach(rule => {
        if (rule.keyword && (rule.keyword.includes(',') || rule.keyword.includes(';'))) {
          const parts = rule.keyword.split(/[,;]/).map(k => k.trim()).filter(Boolean);
          parts.forEach(part => {
            if (part && !sanitized.some(s => s.keyword.toLowerCase() === part.toLowerCase() && s.characterName.toLowerCase() === rule.characterName.toLowerCase())) {
              sanitized.push({
                id: `dict_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${Math.random().toString(36).substr(2, 4)}`,
                keyword: part,
                characterName: rule.characterName
              });
            }
          });
        } else if (rule.keyword && rule.characterName) {
          sanitized.push(rule);
        }
      });
      onUpdateDictionary(sanitized);
    }
  }, [dictionary, onUpdateDictionary]);

  const handleDictFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content.split('\n');
      const newRules: DictionaryRule[] = [];
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return; // skip comments and empty

        if (trimmed.includes('|')) {
          const parts = trimmed.split('|');
          if (parts.length >= 2) {
            const p0 = parts[0].trim();
            const p1 = parts[1].trim();
            let charName = '';
            let kws: string[] = [];

            if (p0.includes(',') || p0.includes(';')) {
              charName = p1;
              kws = p0.split(/[,;]/).map(k => k.trim()).filter(Boolean);
            } else if (p1.includes(',') || p1.includes(';')) {
              charName = p0;
              kws = p1.split(/[,;]/).map(k => k.trim()).filter(Boolean);
            } else {
              charName = p1;
              kws = [p0];
            }

            kws.forEach(kw => {
              if (kw && charName) {
                newRules.push({
                  id: `dict_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${Math.random().toString(36).substr(2, 4)}`,
                  keyword: kw,
                  characterName: charName
                });
              }
            });
          }
        }
      });

      if (newRules.length > 0) {
        const updated = [...rules];
        newRules.forEach((newR) => {
          const idx = updated.findIndex((r) => r.keyword.toLowerCase() === newR.keyword.toLowerCase() && r.characterName.toLowerCase() === newR.characterName.toLowerCase());
          if (idx >= 0) {
            updated[idx] = newR; // overwrite duplicate keywords
          } else {
            updated.push(newR);
          }
        });
        setRules(updated);
        alert(`Đã nhập thành công ${newRules.length} quy tắc liên kết từ file .txt!`);
      } else {
        alert('Không tìm thấy quy tắc hợp lệ nào trong file. Đảm bảo cấu trúc là: Từ khóa | Tên nhân vật (Ví dụ: Peter | Brennan)');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input element
  };

  const handleAddManualRule = (e: React.FormEvent) => {
    e.preventDefault();
    const rawKeyword = manualKeyword.trim();
    const charName = manualCharName.trim();
    if (!rawKeyword || !charName) return;

    const kws = rawKeyword.split(/[,;]/).map(k => k.trim()).filter(Boolean);
    if (kws.length === 0) return;

    const updated = [...rules];
    kws.forEach(kw => {
      const idx = updated.findIndex((r) => r.keyword.toLowerCase() === kw.toLowerCase() && r.characterName.toLowerCase() === charName.toLowerCase());
      const newRule = {
        id: `dict_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${Math.random().toString(36).substr(2, 4)}`,
        keyword: kw,
        characterName: charName
      };

      if (idx >= 0) {
        updated[idx] = newRule;
      } else {
        updated.push(newRule);
      }
    });
    setRules(updated);

    setManualKeyword('');
    setManualCharName('');
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const startEditRule = (rule: DictionaryRule) => {
    setEditingRuleId(rule.id);
    setEditingKeyword(rule.keyword);
    setEditingCharName(rule.characterName);
  };

  const handleSaveEditRule = (id: string) => {
    const kw = editingKeyword.trim();
    const char = editingCharName.trim();
    if (!kw || !char) return;

    const updated = rules.map((r) => {
      if (r.id === id) {
        return { ...r, keyword: kw, characterName: char };
      }
      return r;
    });
    setRules(updated);

    setEditingRuleId(null);
  };

  if (!isOpen) return null;

  // Extract list of all unique character name categories sorted and partitioned as requested
  const allRawNames = (() => {
    return Array.from(
      new Set([
        ...images.map(img => img.characterName).filter(Boolean),
        ...createdEmptyChars
      ])
    ).filter(name => name !== 'Tất cả' && name !== 'Không có nhân vật');
  })();

  const onlyCharactersRaw = allRawNames.filter(name => !backgroundNames.includes(name));
  const onlyBackgroundsRaw = allRawNames.filter(name => backgroundNames.includes(name));

  const getSortedGroup = (names: string[]) => {
    const withAssets = names.filter(name => {
      return images.some(img => img.characterName === name);
    });

    const withoutAssets = names.filter(name => {
      return !images.some(img => img.characterName === name);
    });

    withAssets.sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
    withoutAssets.sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));

    return [...withAssets, ...withoutAssets];
  };

  const charactersList = [
    'Tất cả',
    ...getSortedGroup(onlyCharactersRaw),
    'Không có nhân vật'
  ];

  const backgroundsList = getSortedGroup(onlyBackgroundsRaw);


  const handleCreateEmptyCharName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCharName.trim();
    if (!name) return;
    if (backgroundNames.includes(name)) {
      alert('Tên này đã tồn tại trong danh sách bối cảnh!');
      return;
    }
    if (!createdEmptyChars.includes(name)) {
      setCreatedEmptyChars(prev => [...prev, name]);
      setSelectedChar(name);
    }
    setNewCharName('');
    setShowNewCharInput(false);
  };

  const handleCreateEmptyBgName = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newBgName.trim();
    if (!cleanName) return;

    if (backgroundNames.includes(cleanName) || charactersList.includes(cleanName)) {
      alert('Tên này đã tồn tại trong danh sách!');
      return;
    }

    onUpdateBackgroundNames([...backgroundNames, cleanName]);
    setCreatedEmptyChars(prev => [...prev, cleanName]);
    setNewBgName('');
    setShowNewBgInput(false);
    setSelectedChar(cleanName);
  };

  const handleCharTxtImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content.split('\n');
      const newEmptyNames: string[] = [];
      const newRules: DictionaryRule[] = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        let charName = '';
        let keywordsList: string[] = [];

        if (trimmed.includes('|')) {
          const parts = trimmed.split('|');
          if (parts.length >= 2) {
            const p0 = parts[0].trim();
            const p1 = parts[1].trim();

            if (p0.includes(',') || p0.includes(';')) {
              // "Carly, Laura Wright | carly" -> char is p1, keywords are in p0
              charName = p1;
              keywordsList = p0.split(/[,;]/).map(k => k.trim()).filter(Boolean);
            } else if (p1.includes(',') || p1.includes(';')) {
              // "carly | Carly, Laura Wright" -> char is p0, keywords are in p1
              charName = p0;
              keywordsList = p1.split(/[,;]/).map(k => k.trim()).filter(Boolean);
            } else {
              charName = p1;
              keywordsList = [p0];
            }
          }
        } else if (trimmed.includes(':')) {
          const parts = trimmed.split(':');
          if (parts.length >= 2) {
            const p0 = parts[0].trim();
            const p1 = parts[1].trim();
            charName = p0;
            keywordsList = p1.split(/[,;]/).map(k => k.trim()).filter(Boolean);
          }
        } else {
          if (trimmed.includes(',') || trimmed.includes(';')) {
            const parts = trimmed.split(/[,;]/).map(k => k.trim()).filter(Boolean);
            if (parts.length > 0) {
              charName = parts[0];
              keywordsList = parts;
            }
          } else {
            charName = trimmed;
            keywordsList = [trimmed];
          }
        }

        if (charName) {
          if (!newEmptyNames.includes(charName)) {
            newEmptyNames.push(charName);
          }
          keywordsList.forEach((kw) => {
            if (kw) {
              newRules.push({
                id: `dict_${Date.now()}__${Math.random().toString(36).substr(2, 5)}_${Math.random().toString(36).substr(2, 4)}`,
                keyword: kw,
                characterName: charName
              });
            }
          });
        }
      });

      if (newEmptyNames.length > 0) {
        setCreatedEmptyChars(prev => {
          const updated = [...prev];
          newEmptyNames.forEach(name => {
            if (!updated.includes(name)) {
              updated.push(name);
            }
          });
          return updated;
        });

        if (newRules.length > 0 && onUpdateDictionary) {
          const updatedRules = [...rules];
          newRules.forEach((newR) => {
            const idx = updatedRules.findIndex(
              (r) => r.keyword.toLowerCase() === newR.keyword.toLowerCase() && r.characterName.toLowerCase() === newR.characterName.toLowerCase()
            );
            if (idx >= 0) {
              updatedRules[idx] = newR;
            } else {
              updatedRules.push(newR);
            }
          });
          onUpdateDictionary(updatedRules);
        }

        setSelectedChar(newEmptyNames[0]);
        alert(`Đã nhập thành công ${newEmptyNames.length} nhân vật và ${newRules.length} từ khóa từ file .TXT!`);
      } else {
        alert('Không tìm thấy dữ liệu nhân vật hợp lệ trong file .TXT.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportTxt = () => {
    const validChars = charactersList.filter(
      name => name !== 'Tất cả' && name !== 'Không có nhân vật'
    );

    if (validChars.length === 0 && backgroundNames.length === 0) {
      alert('Chưa có nhân vật nào để xuất.');
      return;
    }

    const lines: string[] = [
      '# Danh sách nhân vật và từ khóa phụ đề',
      '# Định dạng: Từ khóa 1, Từ khóa 2 | Tên nhân vật',
      ''
    ];

    validChars.forEach(charName => {
      const charKeywords = rules
        .filter(r => r.characterName === charName)
        .map(r => r.keyword)
        .filter(Boolean);

      if (charKeywords.length > 0) {
        lines.push(`${charKeywords.join(', ')} | ${charName}`);
      } else {
        lines.push(charName);
      }
    });

    if (backgroundNames.length > 0) {
      lines.push('');
      lines.push('# Bối cảnh');
      backgroundNames.forEach(bg => {
        const bgKeywords = rules
          .filter(r => r.characterName === bg)
          .map(r => r.keyword)
          .filter(Boolean);
        if (bgKeywords.length > 0) {
          lines.push(`${bgKeywords.join(', ')} | ${bg}`);
        } else {
          lines.push(bg);
        }
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danh_sach_nhan_vat_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportConfigJson = () => {
    const validChars = charactersList.filter(
      name => name !== 'Tất cả' && name !== 'Không có nhân vật'
    );

    if (validChars.length === 0 && backgroundNames.length === 0) {
      alert('Chưa có nhân vật nào để xuất.');
      return;
    }

    const exportData = {
      version: 1,
      type: 'vsync_characters_config',
      exportDate: new Date().toISOString(),
      totalCharacters: validChars.length,
      characters: validChars,
      backgroundNames: backgroundNames,
      dictionary: rules
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cau_hinh_nhan_vat_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStartExportParts = async (customBatchSize?: number) => {
    const batchSize = customBatchSize || partBatchSize || 500;
    const validChars = charactersList.filter(
      name => name !== 'Tất cả' && name !== 'Không có nhân vật'
    );

    if (images.length === 0 && validChars.length === 0) {
      alert('Thư viện đang trống, chưa có nhân vật hay ảnh nào để xuất.');
      return;
    }

    setIsExportingParts(true);
    setGeneratedPartFiles([]);

    try {
      const characters = Array.from(
        new Set([
          ...createdEmptyChars,
          ...images.map(img => img.characterName).filter(Boolean)
        ])
      ).filter(name => name !== 'Tất cả' && name !== 'Không có nhân vật') as string[];

      const totalImages = images.length;
      const totalParts = Math.max(1, Math.ceil(totalImages / batchSize));

      const newPartsList: {
        part: number;
        totalParts: number;
        imageCount: number;
        fileName: string;
        blobUrl: string;
        sizeMb: string;
      }[] = [];

      for (let p = 0; p < totalParts; p++) {
        const partNum = p + 1;
        const startIdx = p * batchSize;
        const endIdx = Math.min(startIdx + batchSize, totalImages);
        const sliceImages = images.slice(startIdx, endIdx);

        setExportPartsProgress({
          currentPart: partNum,
          totalParts,
          currentImageInPart: 0,
          totalImagesInPart: sliceImages.length,
          processedTotalImages: startIdx,
          totalImages,
          statusText: `Đang xử lý Part ${partNum}/${totalParts} (Ảnh ${startIdx + 1} - ${endIdx})...`
        });

        // Convert sliceImages to Base64 records
        const imageRecords: {
          id: string;
          name: string;
          path: string;
          characterName?: string;
          keywords: string[];
          dataUrl: string;
        }[] = [];

        for (let i = 0; i < sliceImages.length; i++) {
          const img = sliceImages[i];
          if (i % 15 === 0 || i === sliceImages.length - 1) {
            setExportPartsProgress({
              currentPart: partNum,
              totalParts,
              currentImageInPart: i + 1,
              totalImagesInPart: sliceImages.length,
              processedTotalImages: startIdx + i + 1,
              totalImages,
              statusText: `Part ${partNum}/${totalParts}: Đang nén ảnh ${i + 1}/${sliceImages.length}...`
            });
            await new Promise(r => setTimeout(r, 0));
          }

          let dataUrl = '';
          if (img.file) {
            dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve((e.target?.result as string) || '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(img.file as File);
            });
          } else if (img.url) {
            try {
              const resp = await fetch(img.url);
              const blob = await resp.blob();
              dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve((e.target?.result as string) || '');
                reader.onerror = () => resolve('');
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              console.error('Lỗi đọc dữ liệu ảnh:', e);
            }
          }

          imageRecords.push({
            id: img.id,
            name: img.name,
            path: img.path,
            characterName: img.characterName,
            keywords: img.keywords || [],
            dataUrl
          });
        }

        const partExportData = {
          version: 1,
          type: 'vsync_library_backup_part',
          exportDate: new Date().toISOString(),
          part: partNum,
          totalParts,
          partImagesCount: imageRecords.length,
          totalImagesCount: totalImages,
          characters,
          backgroundNames,
          dictionary: rules,
          images: imageRecords
        };

        const jsonStr = JSON.stringify(partExportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
        const fileName = `kho_anh_part_${String(partNum).padStart(2, '0')}_of_${String(totalParts).padStart(2, '0')}.json`;
        const blobUrl = URL.createObjectURL(blob);

        const partItem = {
          part: partNum,
          totalParts,
          imageCount: imageRecords.length,
          fileName,
          blobUrl,
          sizeMb
        };

        newPartsList.push(partItem);
        setGeneratedPartFiles([...newPartsList]);

        // Auto trigger download for this part
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Pause briefly so browser download manager doesn't stutter and RAM is cleared
        if (partNum < totalParts) {
          await new Promise(r => setTimeout(r, 600));
        }
      }

      setExportPartsProgress(null);
    } catch (err) {
      console.error('Lỗi khi xuất Part JSON:', err);
      alert('Có lỗi khi xuất file Part JSON: ' + (err as Error).message);
    } finally {
      setIsExportingParts(false);
    }
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageRegex = /\.(png|jpe?g|webp|gif|bmp)$/i;
    const imageFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      if (imageRegex.test(files[i].name)) {
        imageFiles.push(files[i]);
      }
    }

    if (imageFiles.length === 0) {
      alert('Không tìm thấy tệp ảnh hợp lệ trong thư mục được chọn.');
      e.target.value = '';
      return;
    }

    startTransition(async () => {
      setOptimizeProgress({ current: 0, total: imageFiles.length });
      const loaded: CharacterImage[] = [];
      const detectedCharacters = new Set<string>();

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const path = file.webkitRelativePath || file.name;
        const id = `img_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`;

        let charName: string | undefined = undefined;
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts.length >= 2) {
            // e.g. "Characters/Ava/001.png" -> parts[parts.length - 2] is "Ava"
            const potentialName = parts[parts.length - 2].trim();
            if (potentialName && potentialName.toLowerCase() !== 'images' && potentialName.toLowerCase() !== 'anh') {
              charName = potentialName;
            }
          }
        }

        if (!charName && selectedChar !== 'Tất cả' && selectedChar !== 'Không có nhân vật') {
          charName = selectedChar;
        }

        if (charName) {
          detectedCharacters.add(charName);
        }

        const keywords = extractKeywords(file.name, path);
        if (charName) {
          charName.split(/\s+/).forEach(word => {
            if (word.length >= 2 && !STOP_WORDS.has(word.toLowerCase())) {
              keywords.push(word);
            }
          });
        }

        const { blob, url } = await compressAndResizeImage(file);
        const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });

        loaded.push({
          id,
          name: file.name,
          path,
          url,
          file: compressedFile,
          keywords: Array.from(new Set(keywords)),
          characterName: charName
        });

        if (i % 20 === 0 || i === imageFiles.length - 1) {
          setOptimizeProgress({ current: i + 1, total: imageFiles.length });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (detectedCharacters.size > 0) {
        setCreatedEmptyChars(prev => {
          const updated = Array.from(new Set([...prev, ...Array.from(detectedCharacters)]));
          try {
            localStorage.setItem('vsync_empty_chars', JSON.stringify(updated));
          } catch (err) {}
          return updated;
        });
      }

      if (loaded.length > 0) {
        onImagesLoaded(loaded);
        alert(`✅ Đã nạp thành công ${loaded.length} ảnh từ thư mục! Tự động nhận diện ${detectedCharacters.size} danh mục nhân vật.`);
      }
      setOptimizeProgress(null);
      e.target.value = '';
    });
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    const files: File[] = Array.from(rawFiles);
    setIsImportingJson(true);

    let totalImportedImagesCount = 0;
    let totalImportedRulesCount = 0;
    const restoredCharsSet = new Set<string>();
    const restoredBgsSet = new Set<string>(backgroundNames);
    const restoredRulesMap = new Map<string, DictionaryRule>();
    rules.forEach(r => {
      restoredRulesMap.set(`${r.keyword.toLowerCase()}__${r.characterName.toLowerCase()}`, r);
    });

    try {
      for (let f = 0; f < files.length; f++) {
        const file = files[f];

        setImportBatchProgress({
          currentFileIndex: f + 1,
          totalFiles: files.length,
          currentFileName: file.name,
          currentImageInFile: 0,
          totalImagesInFile: 0,
          totalImagesLoadedSoFar: totalImportedImagesCount
        });

        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve((evt.target?.result as string) || '');
          reader.onerror = reject;
          reader.readAsText(file);
        });

        if (!content) continue;
        const data = JSON.parse(content);
        if (!data || typeof data !== 'object') continue;

        // 1. Merge Characters
        if (Array.isArray(data.characters)) {
          data.characters.forEach((c: any) => {
            if (typeof c === 'string' && c.trim() && c !== 'Tất cả' && c !== 'Không có nhân vật') {
              restoredCharsSet.add(c.trim());
            }
          });
        }

        // 2. Merge Backgrounds
        if (Array.isArray(data.backgroundNames)) {
          data.backgroundNames.forEach((b: any) => {
            if (typeof b === 'string' && b.trim()) {
              restoredBgsSet.add(b.trim());
            }
          });
        }

        // 3. Merge Dictionary
        if (Array.isArray(data.dictionary)) {
          data.dictionary.forEach((r: any) => {
            if (r && r.keyword && r.characterName) {
              const kwParts = String(r.keyword).split(/[,;]/).map((k: string) => k.trim()).filter(Boolean);
              kwParts.forEach((kw: string) => {
                const charName = String(r.characterName).trim();
                const key = `${kw.toLowerCase()}__${charName.toLowerCase()}`;
                if (!restoredRulesMap.has(key)) {
                  restoredRulesMap.set(key, {
                    id: r.id || `dict_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_${Math.random().toString(36).substr(2, 4)}`,
                    keyword: kw,
                    characterName: charName
                  });
                  totalImportedRulesCount++;
                }
              });
            }
          });
        }

        // 4. Reconstruct and stream images for this specific file/part
        if (Array.isArray(data.images) && data.images.length > 0) {
          const reconstructedImages: CharacterImage[] = [];

          for (let i = 0; i < data.images.length; i++) {
            const imgData = data.images[i];
            if (i % 20 === 0 || i === data.images.length - 1) {
              setImportBatchProgress({
                currentFileIndex: f + 1,
                totalFiles: files.length,
                currentFileName: file.name,
                currentImageInFile: i + 1,
                totalImagesInFile: data.images.length,
                totalImagesLoadedSoFar: totalImportedImagesCount + reconstructedImages.length
              });
              await new Promise(r => setTimeout(r, 0));
            }

            if (imgData.dataUrl && typeof imgData.dataUrl === 'string' && imgData.dataUrl.startsWith('data:')) {
              try {
                const fileName = imgData.name || `image_${i + 1}.png`;
                const arr = imgData.dataUrl.split(',');
                const mimeMatch = arr[0].match(/:(.*?);/);
                const mime = mimeMatch ? mimeMatch[1] : 'image/png';
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                  u8arr[n] = bstr.charCodeAt(n);
                }
                const imageFile = new File([u8arr], fileName, { type: mime });
                const blobUrl = URL.createObjectURL(imageFile);

                const charName = imgData.characterName ? String(imgData.characterName).trim() : undefined;
                if (charName && charName !== 'Tất cả' && charName !== 'Không có nhân vật') {
                  restoredCharsSet.add(charName);
                }

                reconstructedImages.push({
                  id: imgData.id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${i}`,
                  name: fileName,
                  path: imgData.path || fileName,
                  url: blobUrl,
                  file: imageFile,
                  keywords: Array.isArray(imgData.keywords) ? imgData.keywords : [charName || ''],
                  characterName: charName
                });
              } catch (e) {
                console.error('Lỗi giải mã ảnh dataUrl:', e);
              }
            }
          }

          if (reconstructedImages.length > 0) {
            onImagesLoaded(reconstructedImages, true);
            totalImportedImagesCount += reconstructedImages.length;
          }
        }

        // Allow Garbage Collector to clean memory before next file
        await new Promise(r => setTimeout(r, 80));
      }

      // Update state for characters, backgrounds, rules
      if (restoredCharsSet.size > 0) {
        const charList = Array.from(restoredCharsSet);
        setCreatedEmptyChars(prev => {
          const updated = Array.from(new Set([...prev, ...charList]));
          try {
            localStorage.setItem('vsync_empty_chars', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        if (selectedChar === 'Tất cả' || selectedChar === 'Không có nhân vật') {
          setSelectedChar(charList[0]);
        }
      }

      if (restoredBgsSet.size > 0 && onUpdateBackgroundNames) {
        onUpdateBackgroundNames(Array.from(restoredBgsSet));
      }

      if (onUpdateDictionary) {
        onUpdateDictionary(Array.from(restoredRulesMap.values()));
      }

      alert(
        `✅ ĐÃ NHẬP THÀNH CÔNG ${files.length} TỆP JSON!\n\n` +
        `- Tổng số ảnh đã nạp vào kho: ${totalImportedImagesCount.toLocaleString()} ảnh\n` +
        `- Danh sách nhân vật: ${restoredCharsSet.size} nhân vật\n` +
        `- Danh mục từ khóa phụ đề: ${restoredRulesMap.size} quy tắc liên kết`
      );
    } catch (err) {
      console.error('Lỗi khi nạp danh sách JSON:', err);
      alert('Lỗi nạp tệp JSON: ' + (err as Error).message);
    } finally {
      setIsImportingJson(false);
      setImportBatchProgress(null);
      e.target.value = '';
    }
  };

  const handleFileUploadTriggered = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const acceptedFiles: File[] = [];
      const imageRegex = /\.(png|jpe?g|webp|gif|bmp)$/i;
      
      for (let i = 0; i < files.length; i++) {
        if (imageRegex.test(files[i].name)) {
          acceptedFiles.push(files[i]);
        }
      }

      if (acceptedFiles.length > 0) {
        setPendingFiles(acceptedFiles);
        // Default the name assignment input to either currently selected character (if it's not "Tất cả") or blank
        setCharNamingInput(selectedChar === 'Tất cả' || selectedChar === 'Không có nhân vật' ? '' : selectedChar);
        setShowNamingPrompt(true);
      }
    }
    // reset input
    e.target.value = '';
  };

  const handleCompleteNamingAndSave = () => {
    const finalCharName = charNamingInput.trim() || 'Không có nhân vật';
    
    startTransition(async () => {
      setOptimizeProgress({ current: 0, total: pendingFiles.length });
      const loaded: CharacterImage[] = [];

      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const path = file.webkitRelativePath || file.name;
        const keywords = extractKeywords(file.name, path);
        const id = `img_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`;

        // Process resizing to optimal dimensions
        const { blob, url } = await compressAndResizeImage(file);
        const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });

        // Add additional keywords matching the character name for smart matching
        const customKeywords = new Set([...keywords]);
        finalCharName.split(/\s+/).forEach(word => {
          const trimmed = word.trim().toLowerCase();
          if (trimmed.length >= 2 && !STOP_WORDS.has(trimmed)) {
            customKeywords.add(word);
          }
        });

        loaded.push({
          id,
          name: file.name,
          path,
          url,
          file: compressedFile,
          keywords: Array.from(customKeywords),
          characterName: finalCharName
        });

        setOptimizeProgress({ current: i + 1, total: pendingFiles.length });
      }

      if (loaded.length > 0) {
        onImagesLoaded(loaded);
        // Ensure character name gets registered in list even if select character changes
        if (finalCharName !== 'Không có nhân vật' && !createdEmptyChars.includes(finalCharName)) {
          setCreatedEmptyChars(prev => [...prev, finalCharName]);
        }
        setSelectedChar(finalCharName);
      }

      // Cleanup batch state
      setPendingFiles([]);
      setShowNamingPrompt(false);
      setOptimizeProgress(null);
    });
  };

  // Filter images according to active selection
  const filteredCategoryImages = images.filter(img => {
    if (selectedChar === 'Tất cả') return true;
    if (selectedChar === 'Không có nhân vật') return !img.characterName || img.characterName === 'Không có nhân vật';
    return img.characterName === selectedChar;
  });

  // Filter dictionary rules according to active selection
  const filteredRules = rules.filter((rule) => {
    if (selectedChar === 'Tất cả') return true;
    if (selectedChar === 'Không có nhân vật') return false; // mappings are explicitly to characters
    return rule.characterName.toLowerCase() === selectedChar.toLowerCase();
  });

  const searchedRules = filteredRules.filter(rule => 
    rule.keyword.toLowerCase().includes(dictSearchQuery.toLowerCase()) ||
    rule.characterName.toLowerCase().includes(dictSearchQuery.toLowerCase())
  );

  return (
    <>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200 ${!isOpen ? 'hidden pointer-events-none' : ''}`} id="kho-anh-modal-overlay">
      <div 
        className="bg-[#0E0E11] border border-white/10 rounded-2xl w-full max-w-4xl flex flex-col h-[85vh] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-[#131317] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl shrink-0">
              <FolderLock size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-md font-bold text-white uppercase tracking-tight truncate">
                Kho Thư Viện Ảnh Nhân Vật (Grouped Catalog)
              </h2>
              <p className="text-[11px] text-white/40 mt-0.5 truncate">
                Sắp xếp và lọc tài nguyên ảnh tĩnh theo nhân vật để khớp phụ đề độc lập thông minh
              </p>
            </div>
          </div>

          {/* Quick Action Tools: JSON & TXT Import/Export */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {/* JSON Input - Supports MULTIPLE files for sequential Part import */}
            <input
              type="file"
              ref={jsonFileInputRef}
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={handleImportJson}
            />

            {/* Folder Input */}
            <input
              type="file"
              ref={folderInputRef}
              {...({ webkitdirectory: "", directory: "", multiple: true } as any)}
              className="hidden"
              onChange={handleFolderUpload}
            />

            {/* Direct Folder Import */}
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600/25 hover:bg-sky-600/40 border border-sky-500/40 text-sky-300 text-xs font-bold rounded-lg transition-all active:scale-95 shadow-sm"
              title="Chọn thư mục chứa ảnh trên máy tính (tự động phân loại theo thư mục con nhân vật, không sợ tràn RAM)"
            >
              <FolderUp size={13} />
              <span>Nhập Thư Mục Ảnh</span>
            </button>

            {/* Export Config JSON (Lightweight, instant, best for transferring characters + keywords) */}
            <button
              type="button"
              onClick={handleExportConfigJson}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg transition-all active:scale-95 shadow-sm"
              title="Xuất nhanh Danh sách Nhân vật & Từ khóa phụ đề (file .JSON nhẹ, chuyển sang máy khác chỉ 1 click)"
            >
              <FileJson size={13} />
              <span>Xuất Cấu Hình JSON</span>
            </button>

            {/* Export JSON split into Parts (Anti-Out of Memory) */}
            <button
              type="button"
              onClick={() => setShowExportPartsModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 text-indigo-300 text-xs font-bold rounded-lg transition-all active:scale-95 shadow-sm"
              title="Xuất kho ảnh chia thành nhiều Part nhỏ (chống lỗi tràn bộ nhớ RAM khi chuyển sang máy khác)"
            >
              <Layers size={13} />
              <span>Xuất JSON (Chia Part)</span>
            </button>

            {/* Import JSON (Supports selecting 1 or MULTIPLE Part files at once) */}
            <button
              type="button"
              onClick={() => jsonFileInputRef.current?.click()}
              disabled={isImportingJson}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-300 text-xs font-bold rounded-lg transition-all active:scale-95 shadow-sm"
              title="Nhập cấu hình hoặc chọn toàn bộ các file Part JSON cùng lúc (hệ thống tự động nạp tuần tự chống tràn RAM)"
            >
              {isImportingJson ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>{isImportingJson ? `Đang nạp Part ${importBatchProgress?.currentFileIndex}/${importBatchProgress?.totalFiles}...` : 'Nhập JSON (Các Part)'}</span>
            </button>

            {/* Export TXT */}
            <button
              type="button"
              onClick={handleExportTxt}
              className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg transition-all active:scale-95 shadow-sm"
              title="Xuất danh sách nhân vật & từ khóa ra file .TXT"
            >
              <FileText size={13} />
              <span>Xuất .TXT</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Inner Two Column Split Panels */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Panel: Sidebar containing Character Name groupings */}
          <div className="w-1/3 border-r border-white/10 bg-[#070709] flex flex-col overflow-y-auto">


            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0e0e11]/50 shrink-0">
              <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase flex items-center gap-1">
                <Users size={11} /> Nhân vật
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {!showNewCharInput && (
                  <button
                    type="button"
                    onClick={() => setShowNewCharInput(true)}
                    className="flex items-center gap-1 text-[10px] bg-sky-600 hover:bg-sky-500 active:scale-95 text-white px-2 py-1 rounded font-bold transition-all"
                    title="Thêm nhân vật thủ công"
                  >
                    <Plus size={10} /> Thêm
                  </button>
                )}

                <input
                  type="file"
                  id="bulk-char-txt-input"
                  accept=".txt"
                  className="hidden"
                  onChange={handleCharTxtImport}
                />
                
                <button
                  type="button"
                  onClick={() => document.getElementById('bulk-char-txt-input')?.click()}
                  className="flex items-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-2 py-1 rounded font-bold transition-all"
                  title="Nhập danh sách nhân vật từ file .txt"
                >
                  <Upload size={10} /> Nhập .TXT
                </button>
              </div>
            </div>

            {/* Quick Create Empty Character Input Form */}
            {showNewCharInput && (
              <form onSubmit={handleCreateEmptyCharName} className="p-3 bg-slate-900/40 border-b border-white/5 animate-in slide-in-from-top-2 duration-100">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/50 block font-medium">Nhập tên nhân vật mới:</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="Ví dụ: Sarah, Dũng Sỹ..."
                      value={newCharName}
                      onChange={(e) => setNewCharName(e.target.value)}
                      className="flex-1 bg-black text-xs px-2.5 py-1 rounded border border-white/10 text-white focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="px-2 bg-sky-500 hover:bg-sky-450 rounded text-xs text-white"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewCharInput(false)}
                      className="px-2 bg-white/5 hover:bg-white/10 rounded text-xs text-white/50"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Combined Scroll Container */}
            <div className="flex-grow overflow-y-auto p-2 space-y-3">
              
              {/* Category section: CHARACTERS */}
              <div className="space-y-1">
                <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold text-white/35 uppercase tracking-wider shrink-0">
                  <span>👤 NHÂN VẬT</span>
                  <span className="font-mono text-[9px]">ẢNH</span>
                </div>
                {charactersList.map((charName) => {
                const imgCount = images.filter(img => {
                  if (charName === 'Tất cả') return true;
                  if (charName === 'Không có nhân vật') return !img.characterName || img.characterName === 'Không có nhân vật';
                  return img.characterName === charName;
                }).length;

                const canDelete = charName !== 'Tất cả' && charName !== 'Không có nhân vật';

                return (
                  <div
                    key={charName}
                    onClick={() => setSelectedChar(charName)}
                    className={`group/char w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                      selectedChar === charName
                        ? 'bg-sky-600 text-white font-bold shadow-md'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1">
                      <div className={`p-1 rounded-md ${
                        selectedChar === charName ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'
                      }`}>
                        <FolderOpen size={12} />
                      </div>
                      <span className="truncate">{charName}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[13px] font-mono font-bold ${
                        selectedChar === charName ? 'bg-white/35 text-white' : 'bg-black text-white/90'
                      }`}>
                        {imgCount}
                      </span>
                      
                      {canDelete && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteChar === charName ? (
                            <div className="flex items-center gap-1 bg-rose-590/10 border border-rose-500/30 rounded-lg p-0.5 px-1 animate-in fade-in duration-200">
                              <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider mr-1">Xóa?</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteCharacter?.(charName);
                                  setCreatedEmptyChars(prev => prev.filter(c => c !== charName));
                                  setSelectedChar('Tất cả');
                                  setConfirmDeleteChar(null);
                                }}
                                className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold transition-colors shadow-md shrink-0"
                                title="Xác nhận xóa"
                              >
                                Có
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteChar(null);
                                }}
                                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 text-white/70 rounded text-[9px] font-bold transition-colors shrink-0"
                                title="Hủy bỏ"
                              >
                                Không
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteChar(charName);
                              }}
                              className="p-1 rounded text-rose-500 hover:bg-rose-600 hover:text-white transition-colors bg-rose-500/10 border border-rose-500/20 shadow-sm flex items-center justify-center shrink-0"
                              title="Xóa toàn bộ nhân vật & ảnh"
                            >
                              <X size={12} className="stroke-[3]" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {/* Category section: BACKGROUNDS */}
              <div className="space-y-1 pt-1.5">
                <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold text-amber-400/95 uppercase tracking-wider shrink-0 border-t border-white/5 pt-3">
                  <span className="flex items-center gap-1">🎬 BỐI CẢNH</span>
                  {!showNewBgInput ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewBgInput(true);
                        setShowNewCharInput(false);
                      }}
                      className="text-[9px] font-bold text-amber-400 hover:text-amber-300 bg-amber-400/5 hover:bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/15 cursor-pointer"
                    >
                      + Thêm Bối Cảnh
                    </button>
                  ) : (
                    <span className="font-mono text-[9px] text-amber-400/50">CHỈ CÓ VIDEO</span>
                  )}
                </div>

                {/* Quick Create Empty Background Input Form */}
                {showNewBgInput && (
                  <form onSubmit={handleCreateEmptyBgName} className="p-3 bg-slate-900/40 border-b border-white/5 animate-in slide-in-from-top-2 duration-100 shrink-0">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-white/50 block font-medium">Nhập tên bối cảnh mới:</label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          required
                          autoFocus
                          placeholder="Los Angeles, New York..."
                          value={newBgName}
                          onChange={(e) => setNewBgName(e.target.value)}
                          className="flex-1 bg-black text-xs px-2.5 py-1 rounded border border-white/10 text-white focus:outline-none focus:border-amber-500 font-sans"
                        />
                        <button
                          type="submit"
                          className="px-2 bg-amber-500 hover:bg-amber-450 rounded text-xs text-white font-bold"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewBgInput(false)}
                          className="px-2 bg-white/5 hover:bg-white/10 rounded text-xs text-white/50"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {backgroundsList.length === 0 && !showNewBgInput && (
                  <p className="text-[10px] text-white/30 italic p-2 leading-relaxed">
                    Chưa tạo bối cảnh nào. Bấm "+ Thêm Bối Cảnh" để thiết lập ảnh nền không kế thừa.
                  </p>
                )}

                {backgroundsList.map((charName) => {
                  const imgCount = images.filter(img => img.characterName === charName).length;

                  return (
                    <div
                      key={charName}
                      onClick={() => setSelectedChar(charName)}
                      className={`group/char w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        selectedChar === charName
                          ? 'bg-[#d97706] text-white font-bold shadow-md'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate flex-1">
                        <div className={`p-1 rounded-md ${
                          selectedChar === charName ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'
                        }`}>
                          <FolderOpen size={12} className="text-amber-400" />
                        </div>
                        <span className="truncate">{charName}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[13px] font-mono font-bold ${
                          selectedChar === charName ? 'bg-white/35 text-white' : 'bg-black text-white/95'
                        }`}>
                          {imgCount}
                        </span>
                        
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteChar === charName ? (
                            <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/30 rounded-lg p-0.5 px-1 animate-in fade-in duration-200">
                              <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider mr-1">Xóa?</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteCharacter?.(charName);
                                  onUpdateBackgroundNames(backgroundNames.filter(b => b !== charName));
                                  setCreatedEmptyChars(prev => prev.filter(c => c !== charName));
                                  setSelectedChar('Tất cả');
                                  setConfirmDeleteChar(null);
                                }}
                                className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold transition-colors shadow-md shrink-0"
                                title="Xác nhận xóa"
                              >
                                Có
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteChar(null);
                                }}
                                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 text-white/70 rounded text-[9px] font-bold transition-colors shrink-0"
                                title="Hủy bỏ"
                              >
                                Không
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteChar(charName);
                              }}
                              className="p-1 rounded text-rose-500 hover:bg-rose-600 hover:text-white transition-colors bg-rose-500/10 border border-rose-500/20 shadow-sm flex items-center justify-center shrink-0"
                              title="Xóa toàn bộ bối cảnh"
                            >
                              <X size={12} className="stroke-[3]" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Right Panel: Content / Thumbnails and Actions */}
          <div className="flex-1 bg-[#0A0A0C]/50 flex flex-col">
            {/* Action Header inside Category Preview */}
            <div className="p-4 bg-[#111115]/30 border-b border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1">
                    {backgroundNames.includes(selectedChar) ? 'Bối cảnh: ' : 'Nhân vật: '} 
                    <span className={`${backgroundNames.includes(selectedChar) ? 'text-amber-400' : 'text-sky-400'} text-sm italic font-sans font-bold`}>
                      "{selectedChar}"
                    </span>
                  </h3>
                  <p className="text-[10px] text-white/35 font-medium">
                    Hiển thị {filteredCategoryImages.length} ảnh thuộc về {backgroundNames.includes(selectedChar) ? 'bối cảnh' : 'nhân vật'} này
                  </p>
                </div>
              </div>

              {/* Upload dynamic files for selected character */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={triggerInputRef}
                  onChange={handleFileUploadTriggered}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                
                <button
                  type="button"
                  onClick={() => triggerInputRef.current?.click()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md select-none cursor-pointer"
                >
                  <Upload size={13} /> {backgroundNames.includes(selectedChar) ? 'Thêm ảnh cho bối cảnh' : 'Thêm ảnh cho nhân vật'}
                </button>
              </div>
            </div>

            {/* Sleek Subtitle Keywords/Aliases Editor Section */}
            {selectedChar !== 'Tất cả' && selectedChar !== 'Không có nhân vật' && (
              <div className="px-5 py-3.5 bg-amber-500/5 border-b border-white/10 space-y-3 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <Tag size={12} className="text-amber-505" />
                      Từ khóa trong phụ đề kịch bản (.srt):
                    </h4>
                    <p className="text-[10px] text-white/40 mt-1 font-medium">
                      Khi phụ đề xuất hiện một trong các từ khóa này, hệ thống sẽ tự động gán ảnh của nhân vật <span className="text-sky-400 font-bold font-sans">"{selectedChar}"</span>
                    </p>
                  </div>
                  
                  {/* Form to add a new keyword trigger */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const rawKw = newAliasKeyword.trim();
                      if (!rawKw) return;
                      
                      const kwsToAdd = rawKw.split(/[,;]/).map(k => k.trim()).filter(Boolean);
                      if (kwsToAdd.length === 0) return;

                      let currentRules = [...rules];
                      kwsToAdd.forEach(kw => {
                        // Check if keyword is already mapped to this character
                        const isAlreadyMapped = currentRules.some(
                          r => r.keyword.toLowerCase() === kw.toLowerCase() && r.characterName.toLowerCase() === selectedChar.toLowerCase()
                        );
                        if (isAlreadyMapped) {
                          return;
                        }
                        
                        // Check if keyword is mapped to another character
                        const existingIdx = currentRules.findIndex(
                          r => r.keyword.toLowerCase() === kw.toLowerCase()
                        );
                        if (existingIdx >= 0) {
                          currentRules[existingIdx] = {
                            ...currentRules[existingIdx],
                            characterName: selectedChar,
                            keyword: kw
                          };
                        } else {
                          currentRules.push({
                            id: `dict_${Date.now()}_keyword_${Math.random().toString(36).substr(2, 5)}_${Math.random().toString(36).substr(2, 4)}`,
                            keyword: kw,
                            characterName: selectedChar
                          });
                        }
                      });

                      setRules(currentRules);
                      setNewAliasKeyword('');
                    }}
                    className="flex items-center gap-1.5 shrink-0"
                  >
                    <input
                      type="text"
                      placeholder="Thêm từ khóa (phân cách bằng dấu phẩy)..."
                      value={newAliasKeyword}
                      onChange={(e) => setNewAliasKeyword(e.target.value)}
                      className="bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 w-56 focus:outline-none focus:border-amber-500 font-mono h-8"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold text-white transition-all active:scale-95 shadow shrink-0 select-none h-8"
                    >
                      Thêm
                    </button>
                  </form>
                </div>

                {/* Rendering tags of triggers */}
                <div className="flex flex-wrap gap-2 items-center">
                  {rules.filter(r => r.characterName === selectedChar).length > 0 ? (
                    rules
                      .filter(r => r.characterName === selectedChar)
                      .map((rule) => (
                        <span
                          key={rule.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs font-mono font-medium rounded-lg"
                        >
                          {rule.keyword}
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="text-amber-500 hover:text-rose-400 font-bold text-[10px] p-0.5"
                            title="Xóa từ khóa này"
                          >
                            ✕
                          </button>
                        </span>
                      ))
                  ) : (
                    <p className="text-[10px] text-amber-400/50 italic font-medium">
                      Chưa có từ khóa nào được thiết lập cho nhân vật này. Thêm từ khóa ở ô phía trên để hệ thống tự động phát hiện trong phụ đề.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Grid of images preview */}
            <div className="flex-1 p-5 overflow-y-auto">
              {selectedChar === 'Tất cả' ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <span className="text-[120px] font-sans font-extrabold text-[#38bdf8] select-none leading-none tracking-tight">
                    {images.length}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-white/50 uppercase tracking-widest">
                      Tổng số lượng Ảnh đang có
                    </h4>
                    <p className="text-[11px] text-white/30 max-w-sm mt-1.5 leading-relaxed">
                      Để xem chi tiết tài nguyên, bảo mật tốc độ tải và tránh giật lag, vui lòng bấm chọn từng nhân vật hoặc bối cảnh bên danh mục trái.
                    </p>
                  </div>
                </div>
              ) : filteredCategoryImages.length > 0 ? (
                !isRevealed ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-6 py-6 font-sans">
                    <div className="relative w-52 aspect-[64/72] bg-[#050505] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                      <img
                        src={filteredCategoryImages[0].url}
                        alt={filteredCategoryImages[0].name}
                        className="w-full h-full object-cover opacity-65 filter blur-[0.5px]"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3 text-center">
                        <p className="text-[10px] text-white/60 font-mono truncate">{filteredCategoryImages[0].name}</p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setIsRevealed(true)}
                      className="px-6 py-3 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-lg cursor-pointer"
                    >
                      <ImageIcon size={14} /> MỞ ẢNH ({filteredCategoryImages.length})
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {filteredCategoryImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative aspect-[64/72] bg-[#050505] border border-white/10 hover:border-sky-500/50 rounded-xl overflow-hidden transition-all shadow-md animate-fade-in"
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                        
                        {/* Name tag Overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                          <p className="text-[9px] text-white/80 font-mono truncate">
                            {img.name}
                          </p>
                        </div>

                        {/* Deletion of individual index */}
                        <button
                          type="button"
                          onClick={() => onDeleteImage(img.id)}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-black/80 hover:bg-rose-600 text-white rounded-md transition-colors opacity-0 group-hover:opacity-100 duration-155 shadow-lg"
                          title="Xóa ảnh này"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 bg-white/5 border border-white/5 text-white/20 rounded-full flex items-center justify-center">
                    <ImageIcon size={22} className="opacity-60" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white/50">Thư mục chưa có ảnh</h4>
                    <p className="text-[11px] text-white/30 max-w-sm mt-1 leading-relaxed">
                      Nhân vật này chưa chứa bất kỳ ảnh nào. Bấm vào nút "Thêm ảnh cho nhân vật" ở góc trên để tải ảnh gán trực tiếp.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Save/Close bar Footer */}
        <div className="p-4 border-t border-white/10 bg-[#131317] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all text-white font-bold text-xs"
          >
            Đóng bảng
          </button>
        </div>
      </div>
      </div>
      {showNamingPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111114] border border-white/15 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                <Tag size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-tight">Đặt tên nhóm nhân vật</h3>
                <p className="text-[11px] text-white/40">Gán {pendingFiles.length} ảnh vừa nạp vào danh mục nhân vật</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Nhập tên hoặc chọn nhân vật:</label>
                
                {/* Text input with quick suggestions */}
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: Sarah, Dũng Sỹ..."
                  value={charNamingInput}
                  onChange={(e) => setCharNamingInput(e.target.value)}
                  className="w-full bg-black text-xs px-3 py-2.5 rounded-lg border border-white/10 text-white font-medium focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* List of existing characters to quickly tap to fill */}
              {charactersList.filter(n => n !== 'Tất cả' && n !== 'Không có nhân vật').length > 0 && (
                <div>
                  <span className="text-[9px] text-white/35 uppercase block mb-1">Hoặc chọn tên có sẵn:</span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {charactersList
                      .filter(n => n !== 'Tất cả' && n !== 'Không có nhân vật')
                      .map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setCharNamingInput(name)}
                          className="text-[10px] bg-white/5 hover:bg-white/10 text-white/70 px-2 py-1 rounded transition-colors"
                        >
                          {name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Processing feedback */}
            {optimizeProgress && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Đang tối ưu dung lượng...</span>
                  <span>{optimizeProgress.current}/{optimizeProgress.total}</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-sky-500 h-full transition-all duration-100" 
                    style={{ width: `${(optimizeProgress.current / optimizeProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setPendingFiles([]);
                  setShowNamingPrompt(false);
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/60 transition-colors"
              >
                Hủy tải lên
              </button>
              
              <button
                type="button"
                disabled={isPending || !charNamingInput.trim()}
                onClick={handleCompleteNamingAndSave}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Đang nén ảnh...
                  </>
                ) : (
                  <>
                    <Check size={12} />
                    Xác nhận &amp; Lưu
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xuất JSON Chia Nhiều Part */}
      {showExportPartsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#121217] border border-white/15 rounded-2xl w-full max-w-xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/15 text-indigo-400 rounded-xl">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">Xuất JSON Chia Nhiều Part (Chống Tràn RAM)</h3>
                  <p className="text-[11px] text-white/40">Chia nhỏ kho ảnh thành các tệp an toàn (~20MB) để chuyển sang máy khác</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isExportingParts}
                onClick={() => {
                  setShowExportPartsModal(false);
                  setGeneratedPartFiles([]);
                  setExportPartsProgress(null);
                }}
                className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Info Metrics */}
            <div className="grid grid-cols-3 gap-2 py-1">
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-center">
                <span className="text-[10px] text-white/40 uppercase block">Tổng số ảnh</span>
                <span className="text-sm font-bold text-white">{images.length.toLocaleString()}</span>
              </div>
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-center">
                <span className="text-[10px] text-white/40 uppercase block">Số ảnh mỗi Part</span>
                <span className="text-sm font-bold text-indigo-300">{partBatchSize} ảnh</span>
              </div>
              <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-center">
                <span className="text-[10px] text-white/40 uppercase block">Số Part dự kiến</span>
                <span className="text-sm font-bold text-emerald-400">
                  {Math.max(1, Math.ceil(images.length / partBatchSize))} Part
                </span>
              </div>
            </div>

            {/* Batch Size Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-white/60 block">Chọn kích cỡ mỗi Part:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { size: 300, label: '300 ảnh', note: '~15 MB' },
                  { size: 500, label: '500 ảnh', note: '~25 MB (Khuyên dùng)' },
                  { size: 800, label: '800 ảnh', note: '~40 MB' },
                  { size: 1000, label: '1000 ảnh', note: '~50 MB' }
                ].map(opt => (
                  <button
                    key={opt.size}
                    type="button"
                    disabled={isExportingParts}
                    onClick={() => setPartBatchSize(opt.size)}
                    className={`px-2 py-2 rounded-xl text-left border transition-all ${
                      partBatchSize === opt.size
                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm'
                        : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] text-white/40">{opt.note}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Progress Display */}
            {isExportingParts && exportPartsProgress && (
              <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-indigo-300 font-bold flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin text-indigo-400" />
                    {exportPartsProgress.statusText}
                  </span>
                  <span className="text-white/60 text-[11px]">
                    Part {exportPartsProgress.currentPart} / {exportPartsProgress.totalParts}
                  </span>
                </div>

                {/* Progress bar for all images */}
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-sky-400 h-full transition-all duration-150"
                    style={{
                      width: `${(exportPartsProgress.processedTotalImages / (exportPartsProgress.totalImages || 1)) * 100}%`
                    }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Tiến độ toàn bộ: {exportPartsProgress.processedTotalImages} / {exportPartsProgress.totalImages} ảnh</span>
                  <span>Đã tải về trình duyệt tự động...</span>
                </div>
              </div>
            )}

            {/* Generated Parts Download List */}
            {generatedPartFiles.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-white/70">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 size={13} />
                    Đã tạo thành công {generatedPartFiles.length} / {Math.max(1, Math.ceil(images.length / partBatchSize))} Part
                  </span>
                  <span className="text-white/40 text-[10px]">Trình duyệt đã tự động tải về</span>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {generatedPartFiles.map((partItem) => (
                    <div
                      key={partItem.part}
                      className="flex items-center justify-between bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileStack size={13} className="text-indigo-400 shrink-0" />
                        <span className="font-mono text-[11px] text-white truncate">{partItem.fileName}</span>
                        <span className="text-[10px] text-white/40 shrink-0">({partItem.imageCount} ảnh • {partItem.sizeMb} MB)</span>
                      </div>
                      <a
                        href={partItem.blobUrl}
                        download={partItem.fileName}
                        className="flex items-center gap-1 text-[10px] bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 px-2 py-1 rounded transition-colors shrink-0 font-medium"
                      >
                        <Download size={10} />
                        Tải lại
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User instructions */}
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 text-[11px] text-sky-200/90 leading-relaxed">
              <strong className="text-sky-300 block mb-0.5 font-bold">💡 Cách nhập vào máy tính khác cực kỳ đơn giản:</strong>
              1. Sao chép tất cả các tệp <code className="bg-black/30 px-1 py-0.5 rounded text-white font-mono">kho_anh_part_XX.json</code> sang máy mới.<br />
              2. Bấm nút <strong className="text-white">"Nhập JSON (Các Part)"</strong> trên thanh công cụ và giữ phím <strong className="text-white">Ctrl + A</strong> (hoặc Shift) để chọn tất cả các file Part cùng lúc.<br />
              3. Hệ thống sẽ tự động nạp tuần tự từng Part một cách nhẹ nhàng mà không bao giờ bị lỗi tràn RAM!
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                disabled={isExportingParts}
                onClick={() => {
                  setShowExportPartsModal(false);
                  setGeneratedPartFiles([]);
                  setExportPartsProgress(null);
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/60 transition-colors"
              >
                {generatedPartFiles.length > 0 && !isExportingParts ? 'Đóng' : 'Hủy'}
              </button>

              <button
                type="button"
                disabled={isExportingParts || images.length === 0}
                onClick={() => handleStartExportParts()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/30"
              >
                {isExportingParts ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Đang xuất các Part...
                  </>
                ) : (
                  <>
                    <HardDriveDownload size={14} />
                    Bắt đầu Xuất & Tải về toàn bộ Part
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay Hiển thị Tiến độ Nhập JSON tuần tự */}
      {isImportingJson && importBatchProgress && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#121217] border border-purple-500/30 rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl">
                <PackageOpen size={22} className="animate-pulse" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white uppercase tracking-tight">Đang Nhập JSON Tuần Tự</h3>
                <p className="text-[11px] text-white/40">Giải phóng bộ nhớ liên tục để chống tràn RAM</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-xl p-3.5 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-purple-300 font-bold">
                  Tệp {importBatchProgress.currentFileIndex} / {importBatchProgress.totalFiles}
                </span>
                <span className="text-white/40 text-[10px] truncate max-w-[200px]">
                  {importBatchProgress.currentFileName}
                </span>
              </div>

              {/* Progress for current file */}
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-100"
                  style={{
                    width: importBatchProgress.totalImagesInFile > 0
                      ? `${(importBatchProgress.currentImageInFile / importBatchProgress.totalImagesInFile) * 100}%`
                      : '100%'
                  }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-white/50">
                <span>Giải mã ảnh: {importBatchProgress.currentImageInFile} / {importBatchProgress.totalImagesInFile || '...'}</span>
                <span>Đã nạp: <strong className="text-emerald-400">{importBatchProgress.totalImagesLoadedSoFar.toLocaleString()}</strong> ảnh</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-white/40 justify-center">
              <Loader2 size={12} className="animate-spin text-purple-400" />
              <span>Vui lòng giữ nguyên cửa sổ này trong khi hệ thống nạp dữ liệu...</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
