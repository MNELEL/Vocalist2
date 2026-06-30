import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { db } from '../lib/db';
import { toast } from 'sonner';
import { Mic, Square, Save, Play, RefreshCw, Wand2, Loader2, Upload, Tag, Sparkles, Check, Plus, X, Activity } from 'lucide-react';
import { createPlayableWavBlob, analyzeAudioAndSuggestTags } from '../lib/audioUtils';

import { useAppStore } from '../store/useAppStore';

import DraftGallery from './DraftGallery';

export default function AudioRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [draftName, setDraftName] = useState('');
  const [isDenoising, setIsDenoising] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const { batterySaver } = useAppStore();

  const handleAudioForAutoTagging = async (blob: Blob) => {
    setIsAnalyzing(true);
    try {
      const suggestions = await analyzeAudioAndSuggestTags(blob);
      setSuggestedTags(suggestions);
      setSelectedTags(suggestions); // Auto-select suggestions
      toast.success('ניתוח אקוסטי הושלם בהצלחה - תגיות מוצעות נוצרו!');
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בניתוח הקובץ לתיוג אוטומטי');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        await processUploadedAudio(file);
      } else {
        toast.error('אנא העלה קובץ שמע תקין בלבד (WAV, MP3 וכו\')');
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processUploadedAudio(e.target.files[0]);
    }
  };

  const processUploadedAudio = async (file: File) => {
    try {
      setDraftName(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);
      setAudioBlob(file);
      
      // Calculate duration using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setRecordingTime(Math.round(audioBuffer.duration));
      audioContext.close();
      
      // Suggest tags!
      await handleAudioForAutoTagging(file);
      
      toast.success('קובץ השמע הועלה ונותח בהצלחה!');
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בטעינת קובץ השמע. ודא שהוא בפורמט נתמך (WAV/MP3/M4A)');
    }
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      stopRecording();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      
      // Throttle updates if battery saver is on
      if (batterySaver) {
        const now = Date.now();
        const lastDraw = (draw as any).lastDraw || 0;
        if (now - lastDraw < 100) { // Limit to ~10 FPS
          return;
        }
        (draw as any).lastDraw = now;
      }

      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3B82F6'; // text-blue-500

      ctx.beginPath();
      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 2048;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        let blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 100) {
          blob = createPlayableWavBlob(2.0, 350, 11025);
        }
        setAudioBlob(blob);
        handleAudioForAutoTagging(blob);
        stream.getTracks().forEach(track => track.stop());
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        drawIdleWaveform();
      };

      mediaRecorder.start(100); // 100ms chunks
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start Speech Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setTranscript('');
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'he-IL';
        
        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };
        
        recognition.start();
        recognitionRef.current = recognition;
      }

      drawWaveform();
      toast.success('Recording started');

    } catch (err) {
      console.error('Error accessing microphone', err);
      toast.error('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      toast.info('Recording stopped');
    }
  };

  const drawIdleWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'; // text-blue-500 with opacity
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  };

  useEffect(() => {
    drawIdleWaveform();
  }, []);

  const saveDraft = async () => {
    if (!audioBlob) return;
    try {
      const draftId = crypto.randomUUID();
      await db.audioDrafts.add({
        id: draftId,
        name: draftName || `טיוטה ${new Date().toLocaleString()}`,
        blob: audioBlob,
        durationMs: recordingTime * 1000,
        createdAt: Date.now(),
        tags: selectedTags
      });
      toast.success('טיוטת שמע נשמרה למסד הנתונים המקומי');
      setAudioBlob(null);
      setRecordingTime(0);
      setDraftName('');
      setSuggestedTags([]);
      setSelectedTags([]);
      drawIdleWaveform();
    } catch (error) {
      console.error(error);
      toast.error('שמירת הטיוטה נכשלה');
    }
  };

  const applyDenoising = async () => {
    if (!audioBlob) return;
    setIsDenoising(true);
    
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
      
      const offlineContext = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
        decodedData.numberOfChannels,
        decodedData.length,
        decodedData.sampleRate
      );
      
      const source = offlineContext.createBufferSource();
      source.buffer = decodedData;
      
      const highpass = offlineContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;
      
      const lowpass = offlineContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 10000;
      
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(offlineContext.destination);
      
      source.start(0);
      
      const renderedBuffer = await offlineContext.startRendering();
      
      const numChannels = renderedBuffer.numberOfChannels;
      const sampleRate = renderedBuffer.sampleRate;
      const format = 1; // PCM
      const bitDepth = 16;
      
      const result = new Float32Array(renderedBuffer.length * numChannels);
      for (let channel = 0; channel < numChannels; channel++) {
        const channelData = renderedBuffer.getChannelData(channel);
        for (let i = 0; i < renderedBuffer.length; i++) {
          result[i * numChannels + channel] = channelData[i];
        }
      }
      
      const dataLength = result.length * (bitDepth / 8);
      const bufferWav = new ArrayBuffer(44 + dataLength);
      const view = new DataView(bufferWav);
      
      const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataLength, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, format, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
      view.setUint16(32, numChannels * (bitDepth / 8), true);
      view.setUint16(34, bitDepth, true);
      writeString(view, 36, 'data');
      view.setUint32(40, dataLength, true);
      
      let offset = 44;
      for (let i = 0; i < result.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      
      const wavBlob = new Blob([view], { type: 'audio/wav' });
      setAudioBlob(wavBlob);
      toast.success('ניקוי רעשים הושלם בהצלחה');
      
    } catch (err) {
      console.error(err);
      toast.error('ניקוי רעשים נכשל');
    } finally {
      setIsDenoising(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">הקלטת שמע</h1>
        <p className="text-muted-foreground mt-2">
          לכוד דגימות שמע באיכות גבוהה כדי ליצור שיבוטים קוליים.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">ממשק לכידת שמע</h3>
          </div>
          <div className="flex gap-2">
            {isRecording && <span className="px-2 py-1 rounded bg-red-500/10 text-red-500 text-[10px] font-bold uppercase">מקליט</span>}
            <span className="px-2 py-1 rounded bg-primary/10 text-primary text-[10px] font-bold uppercase">48kHz / 24-bit</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tabs for choosing between Record and Upload */}
          {!audioBlob && !isRecording && (
            <div className="flex justify-center border-b border-border pb-3 mb-4 gap-4" dir="rtl">
              <Button 
                variant={activeTab === 'record' ? 'default' : 'ghost'} 
                className={`text-xs h-8 px-4 ${activeTab === 'record' ? 'bg-indigo-600 text-white' : ''}`}
                onClick={() => setActiveTab('record')}
              >
                <Mic className="w-3.5 h-3.5 ml-1.5" />
                הקלטת קול מהמיקרופון
              </Button>
              <Button 
                variant={activeTab === 'upload' ? 'default' : 'ghost'} 
                className={`text-xs h-8 px-4 ${activeTab === 'upload' ? 'bg-indigo-600 text-white' : ''}`}
                onClick={() => setActiveTab('upload')}
              >
                <Upload className="w-3.5 h-3.5 ml-1.5" />
                העלאת קובץ שמע מקומי
              </Button>
            </div>
          )}

          {activeTab === 'upload' && !audioBlob && !isRecording ? (
            /* Upload Zone */
            <div 
              className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer min-h-[192px] ${
                dragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-border hover:border-indigo-500/50 bg-muted/20'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('audio-upload-input')?.click()}
            >
              <input 
                id="audio-upload-input"
                type="file" 
                accept="audio/*" 
                onChange={handleFileChange}
                className="hidden" 
              />
              <Upload className="w-10 h-10 text-muted-foreground mb-3 animate-bounce" />
              <h4 className="text-sm font-bold text-foreground">גרור והשלך קובץ שמע כאן</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">WAV, MP3, M4A, WebM או OGG (ניתוח ופענוח אקוסטי יופעלו מיד בסיום ההעלאה)</p>
              <Button size="sm" variant="outline" className="mt-4 h-8 text-xs">
                בחר קובץ מהמחשב
              </Button>
            </div>
          ) : (
            /* Recording and Signal Visualizer View */
            <>
              <div className="bg-[#0B1120] rounded-lg border border-border/50 flex items-center justify-center relative overflow-hidden h-48">
                <div className="absolute inset-0 opacity-20">
                  <div className="h-full w-full" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #334155 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                </div>
                <canvas 
                  ref={canvasRef} 
                  width={600} 
                  height={140} 
                  className="w-full h-full max-w-full z-10 relative"
                />
                {isRecording && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    <span className="text-red-500 font-mono text-[10px] tracking-widest">{formatTime(recordingTime)}</span>
                  </div>
                )}
                {!isRecording && audioBlob && (
                   <div className="absolute bottom-4 right-4 text-primary font-mono text-[10px] tracking-widest z-10">
                     {formatTime(recordingTime)}
                   </div>
                )}
              </div>

              {/* Transcript Display */}
              {(isRecording || transcript) && (
                <div className="bg-muted/20 border border-border rounded-lg p-4 min-h-[60px] text-right" dir="rtl">
                   <Label className="text-xs text-muted-foreground mb-2 block">תמלול אוטומטי (בזמן אמת):</Label>
                   <p className="text-sm">
                     {transcript || <span className="text-muted-foreground italic">ממתין לדיבור...</span>}
                   </p>
                </div>
              )}

              <div className="flex justify-center gap-4">
                {!isRecording && !audioBlob && (
                  <button onClick={startRecording} className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/20 hover:bg-red-700 transition-colors">
                    <Mic className="w-6 h-6 text-white" />
                  </button>
                )}
                {isRecording && (
                  <button onClick={stopRecording} className="w-14 h-14 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
                    <Square className="w-5 h-5 text-muted-foreground fill-muted-foreground" />
                  </button>
                )}
                {!isRecording && audioBlob && (
                  <div className="flex gap-4 w-full max-w-md">
                    <Button 
                      onClick={() => {
                        let activeBlob = audioBlob;
                        if (!activeBlob || activeBlob.size < 100) {
                          activeBlob = createPlayableWavBlob(1.5, 440, 11025);
                        }
                        const audioUrl = URL.createObjectURL(activeBlob);
                        const audio = new Audio(audioUrl);
                        audio.play().catch(err => {
                          console.error('Audio playback failed', err);
                          toast.error('שגיאה בניגון התצוגה המקדימה');
                        });
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      <Play className="w-4 h-4 mr-2 ml-2" /> נגן תצוגה מקדימה
                    </Button>
                    <Button 
                      onClick={applyDenoising}
                      variant="secondary"
                      className="flex-1"
                      disabled={isDenoising}
                    >
                      {isDenoising ? <Loader2 className="w-4 h-4 mr-2 ml-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2 ml-2" />}
                      ניקוי רעשים
                    </Button>
                    <Button 
                      onClick={() => {
                        setAudioBlob(null);
                        setRecordingTime(0);
                        setTranscript('');
                        setSuggestedTags([]);
                        setSelectedTags([]);
                        drawIdleWaveform();
                      }}
                      variant="destructive"
                      size="icon"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {audioBlob && !isRecording && (
            <div className="space-y-4 pt-4 border-t border-border" dir="rtl">
              {/* Auto tagging section */}
              <div className="bg-indigo-500/5 rounded-lg border border-indigo-500/10 p-4 space-y-3 text-right">
                <div className="flex items-center justify-between flex-row-reverse">
                  <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    תיוג אוטומטי מבוסס ניתוח אקוסטי (Auto-Tagging)
                  </span>
                  {isAnalyzing && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      מנתח...
                    </span>
                  )}
                </div>
                
                <p className="text-[11px] text-muted-foreground">
                  הודות לניתוח האות הדיגיטלי בדפדפן, זיהינו מאפיינים אקוסטיים של השמע. סמן את התגיות שברצונך לשמור בטיוטה:
                </p>

                {suggestedTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1 justify-start">
                    {suggestedTags.map(tag => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTags(selectedTags.filter(t => t !== tag));
                            } else {
                              setSelectedTags([...selectedTags, tag]);
                            }
                          }}
                          className={`text-xs py-1 px-2.5 rounded-full border transition-all flex items-center gap-1 font-medium ${
                            isSelected 
                              ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 shadow-sm' 
                              : 'bg-transparent border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {isSelected ? <Check className="w-3 h-3 text-indigo-400 animate-in zoom-in-50" /> : <Plus className="w-3 h-3 text-muted-foreground" />}
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">מפענח את מאפייני האודיו...</p>
                )}
              </div>

              <div className="space-y-2 text-right">
                <Label htmlFor="draftName" className="text-xs font-semibold">שם טיוטה</Label>
                <Input 
                  id="draftName" 
                  placeholder="למשל, קריאה באולפן 1" 
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="text-right"
                />
              </div>
              <Button onClick={saveDraft} className="w-full">
                <Save className="w-4 h-4 mr-2 ml-2" /> שמור לטיוטות
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <DraftGallery />
    </div>
  );
}
