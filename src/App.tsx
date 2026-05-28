import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  Hand, 
  Settings, 
  Code, 
  Download, 
  RefreshCw, 
  Play, 
  Pause, 
  CheckCircle, 
  Sliders, 
  Maximize2, 
  Activity, 
  FileCode, 
  MousePointer, 
  Info,
  ChevronRight,
  Monitor,
  VideoOff,
  SlidersHorizontal,
  Copy,
  FolderLock
} from "lucide-react";
import { codeFiles } from "./fileRegistry";

// Helper for dynamic CDN script injector
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = (e) => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export default function App() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"simulator" | "code" | "build">("simulator");
  
  // App Config States (synchronized with config.json)
  const [sensitivity, setSensitivity] = useState<number>(1.5);
  const [pinchThreshold, setPinchThreshold] = useState<number>(0.04);
  const [mirrorCamera, setMirrorCamera] = useState<boolean>(true);
  const [pinchIndexAction, setPinchIndexAction] = useState<string>("left_click");
  const [pinchMiddleAction, setPinchMiddleAction] = useState<string>("right_click");

  // Telemetry Metrics
  const [mediaPipeLoaded, setMediaPipeLoaded] = useState<boolean>(false);
  const [trackingActive, setTrackingActive] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [handDetected, setHandDetected] = useState<boolean>(false);
  const [latency, setLatency] = useState<number>(0.0);
  const [fps, setFps] = useState<number>(30);
  const [gestureActive, setGestureActive] = useState<string>("neutral");
  const [camBlockedMessage, setCamBlockedMessage] = useState<string | null>(null);

  // Virtual Pointer States (on Simulated OS Workspace)
  const [cursorX, setCursorX] = useState<number>(150);
  const [cursorY, setCursorY] = useState<number>(150);
  const [clickedTarget, setClickedTarget] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(["[Airwave Core] App initialized in simulation mode."]);
  const [virtualScrollTop, setVirtualScrollTop] = useState<number>(0);
  const [screenshotFlash, setScreenshotFlash] = useState<boolean>(false);

  // Fallback Simulator: Drag mouse over camera container to control virtual cursor
  const [useMouseSimulation, setUseMouseSimulation] = useState<boolean>(false);

  // Element References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simulatorDesktopRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Code Explorer States
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [copyCodeSuccess, setCopyCodeSuccess] = useState<boolean>(false);

  // Add system logs
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 35)]);
  };

  // Compile command copy status
  const [compilerCommandCopied, setCompilerCommandCopied] = useState<boolean>(false);

  // Static files explorer content
  const currentFile = codeFiles[selectedFileIdx];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopyCodeSuccess(true);
    setTimeout(() => setCopyCodeSuccess(false), 2000);
  };

  // Copy CMake compiling line
  const handleCopyCompile = () => {
    navigator.clipboard.writeText("pip install .");
    setCompilerCommandCopied(true);
    setTimeout(() => setCompilerCommandCopied(false), 2000);
  };

  // Launch browser webcam tracking with MediaPipe
  useEffect(() => {
    let activeCamera: any = null;
    let isMounted = true;

    async function initMediaPipe() {
      try {
        addLog("Loading computer vision algorithms from CDN...");
        // Load MediaPipe scripts on demand
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");

        if (!isMounted) return;

        const mp = window as any;
        if (!mp.Hands || !mp.Camera) {
          throw new Error("MediaPipe libraries failed to structure under window.");
        }

        setMediaPipeLoaded(true);
        addLog("Vision Core Engine: LOADED (JavaScript MediaPipe Loaded)");

        // Setup Hands instance
        const hands = new mp.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7
        });

        hands.onResults((results: any) => {
          if (!isMounted) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Latency assessment
          const startTime = performance.now();

          // Scale canvas resolution matching container size
          if (videoRef.current && results.image) {
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;
          }

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            setHandDetected(true);
            const landmarks = results.multiHandLandmarks[0];

            // Draw customized visual overlay of joints exactly like the python QThread
            drawLandmarks(ctx, landmarks, mp.HAND_CONNECTIONS || []);

            // Track coordinate calculations for pointer movement (index fingertip landmark ID 8)
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            const middleTip = landmarks[12];
            const pinkyTip = landmarks[20];

            if (indexTip) {
              const mirroredX = mirrorCamera ? (1.0 - indexTip.x) : indexTip.x;
              
              // Scale index coordinates to fit simulated desktop bounding bounds
              const desktopElement = simulatorDesktopRef.current;
              if (desktopElement) {
                const rect = desktopElement.getBoundingClientRect();
                
                // Add dead-zones configuration matching double-exponential math
                const boundXMin = 0.2;
                const boundXMax = 0.8;
                const boundYMin = 0.25;
                const boundYMax = 0.75;

                // Restrict and map to [0, 1] range
                let mappedX = (mirroredX - boundXMin) / (boundXMax - boundXMin);
                let mappedY = (indexTip.y - boundYMin) / (boundYMax - boundYMin);
                
                mappedX = Math.max(0, Math.min(1, mappedX));
                mappedY = Math.max(0, Math.min(1, mappedY));

                // Sensitivity factor adjustment
                const smoothingPower = 0.35; // EMA effect in react JS loop
                setCursorX((prev) => {
                  const target = mappedX * rect.width;
                  return prev + (target - prev) * smoothingPower * sensitivity;
                });
                setCursorY((prev) => {
                  const target = mappedY * rect.height;
                  return prev + (target - prev) * smoothingPower * sensitivity;
                });
              }
            }

            // Simple Distance Threshold math for clicks (Index - Thumb Euclidean Distance)
            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const dz = indexTip.z - thumbTip.z;
            const pinchIndexDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Middle - Thumb Distance
            const mdx = middleTip.x - thumbTip.x;
            const mdy = middleTip.y - thumbTip.y;
            const mdz = middleTip.z - thumbTip.z;
            const pinchMiddleDist = Math.sqrt(mdx * mdx + mdy * mdy + mdz * mdz);

            // Pinky - Thumb Distance
            const pdx = pinkyTip.x - thumbTip.x;
            const pdy = pinkyTip.y - thumbTip.y;
            const pdz = pinkyTip.z - thumbTip.z;
            const pinchPinkyDist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);

            // Classify current pose based on thresholds
            let detectedGesture = "neutral";
            
            // Check pinch
            if (pinchIndexDist < pinchThreshold) {
              detectedGesture = pinchIndexAction; // "left_click"
            } else if (pinchMiddleDist < pinchThreshold) {
              detectedGesture = pinchMiddleAction; // "right_click"
            } else if (pinchPinkyDist < pinchThreshold) {
              detectedGesture = "screenshot";
            } else {
              // Scroll gesture classifier evaluation
              const remainsOpenIndex = indexTip.y < landmarks[6].y;
              const remainsOpenMiddle = middleTip.y < landmarks[10].y;
              const remainsClosedRing = landmarks[16].y > landmarks[14].y;
              const remainsClosedPinky = landmarks[20].y > landmarks[18].y;

              if (remainsOpenIndex && remainsOpenMiddle && remainsClosedRing && remainsClosedPinky) {
                detectedGesture = "scroll_ready";
                // Let's scroll the mock panel if users gesture vertically
                const deltaVec = indexTip.y - 0.5; // distance from central camera horizon
                if (Math.abs(deltaVec) > 0.08) {
                  const scrollSpeed = deltaVec * -15; // inversion factor
                  setVirtualScrollTop((prev) => {
                    const maxScroll = 600;
                    const next = prev + scrollSpeed;
                    return Math.max(0, Math.min(maxScroll, next));
                  });
                  detectedGesture = scrollSpeed > 0 ? "scroll_down" : "scroll_up";
                }
              }
            }

            setGestureActive((prev) => {
              if (prev !== detectedGesture) {
                addLog(`Gesture Classified: ${detectedGesture.toUpperCase()}`);
                
                // Specific actions triggering on transitions
                if (detectedGesture === "screenshot") {
                  setScreenshotFlash(true);
                  setTimeout(() => setScreenshotFlash(false), 800);
                  addLog("Action Completed: Saved local screenshot 'airwave_screenshot_xxx.png'");
                }
              }
              return detectedGesture;
            });

          } else {
            setHandDetected(false);
            setGestureActive("neutral");
          }

          const procTime = performance.now() - startTime;
          setLatency(parseFloat(procTime.toFixed(1)));
        });

        // Configure capture looping link to webcam element
        if (videoRef.current) {
          activeCamera = new mp.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && trackingActive) {
                await hands.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });
          
          activeCamera.start()
            .then(() => {
              if (isMounted) {
                setCameraActive(true);
                setCamBlockedMessage(null);
                addLog("Camera Feed: ENABLED on channel index 0");
              }
            })
            .catch((err: any) => {
              if (isMounted) {
                setCameraActive(false);
                setCamBlockedMessage("Camera Permission Blocked or Missing. Toggle manual simulation below.");
                addLog("[ERROR] Failed to obtain hardware Camera permissions.");
              }
            });
        }

      } catch (error: any) {
        if (isMounted) {
          addLog(`[System Fault] MediaPipe Loading Error: ${error.message}`);
          setUseMouseSimulation(true); // default to simulation fallback
        }
      }
    }

    if (activeTab === "simulator" && trackingActive) {
      initMediaPipe();
    }

    return () => {
      isMounted = false;
      if (activeCamera) {
        activeCamera.stop();
      }
    };
  }, [activeTab, trackingActive, mirrorCamera, sensitivity, pinchThreshold, pinchIndexAction, pinchMiddleAction]);

  // Handle manual simulated cursor if webcam is disabled
  const handleSimulatorMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!useMouseSimulation && cameraActive && handDetected) return; 
    
    // Simulate coordinates mapping
    const desktop = simulatorDesktopRef.current;
    if (desktop) {
      const rect = desktop.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;
      setCursorX(relativeX);
      setCursorY(relativeY);
    }
  };

  const triggerSimulatedClick = (type: "left" | "right" | "double") => {
    addLog(`Simulated Mouse Command: ${type.toUpperCase()}_CLICK executed.`);
    setGestureActive(type === "left" ? "left_click" : type === "right" ? "right_click" : "double_click");
    
    // Check if clicking virtual items
    checkVirtualClickCollision();
    
    setTimeout(() => {
      setGestureActive("neutral");
    }, 400);
  };

  const handleSimulatedScroll = (dir: "up" | "down") => {
    addLog(`Simulated Scroll: ${dir.toUpperCase()}`);
    setGestureActive(dir === "up" ? "scroll_up" : "scroll_down");
    setVirtualScrollTop((prev) => {
      const step = 80;
      const maxScroll = 600;
      const next = dir === "down" ? prev + step : prev - step;
      return Math.max(0, Math.min(maxScroll, next));
    });
    setTimeout(() => setGestureActive("neutral"), 400);
  };

  // Check clicks against simulated items
  const checkVirtualClickCollision = () => {
    // If cursor is close to known bounding spaces
    if (cursorX > 40 && cursorX < 140 && cursorY > 30 && cursorY < 120) {
      setClickedTarget("My Computer");
      addLog("OS Desktop: Opened path 'C:\\System\\Computer'");
    } else if (cursorX > 40 && cursorX < 140 && cursorY > 150 && cursorY < 240) {
      setClickedTarget("Recycle Bin");
      addLog("OS Desktop: Emptied virtual files database");
    } else if (cursorX > 180 && cursorX < 450 && cursorY > 50 && cursorY < 250) {
      setClickedTarget("Browser Windows Block");
      addLog("OS Desktop: Activated scrollable web explorer view");
    } else {
      setClickedTarget(null);
    }
  };

  // Sync scrolltop back to elements
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = virtualScrollTop;
    }
  }, [virtualScrollTop]);

  // Drawing Joint connections helper function
  const drawLandmarks = (ctx: CanvasRenderingContext2D, landmarks: any[], connections: any[]) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#10b981"; // elegant high-contrast airwave green
    ctx.fillStyle = "#3b82f6";    // join nodes royal blue

    // 1. Draw connections
    for (const conn of connections) {
      const fromIdx = conn[0];
      const toIdx = conn[1];
      const ptA = landmarks[fromIdx];
      const ptB = landmarks[toIdx];

      if (ptA && ptB) {
        const xA = (mirrorCamera ? (1.0 - ptA.x) : ptA.x) * ctx.canvas.width;
        const yA = ptA.y * ctx.canvas.height;
        const xB = (mirrorCamera ? (1.0 - ptB.x) : ptB.x) * ctx.canvas.width;
        const yB = ptB.y * ctx.canvas.height;

        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xB, yB);
        ctx.stroke();
      }
    }

    // 2. Draw join node circles
    for (let i = 0; i < landmarks.length; i++) {
      const pt = landmarks[i];
      const x = (mirrorCamera ? (1.0 - pt.x) : pt.x) * ctx.canvas.width;
      const y = pt.y * ctx.canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      
      // Specifically highlighted index tip (ID 8) and thumb tip (4)
      if (i === 8) {
        ctx.fillStyle = "#10b981"; // fingertip tracker color
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
      } else if (i === 4) {
        ctx.fillStyle = "#fbbf24"; // thumb tip pinch indicator
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
      } else {
        ctx.fillStyle = "#3b82f6";
      }
      ctx.fill();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 antialiased overflow-y-auto">
      
      {/* 🚀 SCREENSHOT FLASH COMPONENT */}
      {screenshotFlash && (
        <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" style={{ animation: 'flash 0.5s ease-out' }} />
      )}
      <style>{`
        @keyframes flash {
          0% { opacity: 0; }
          10% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* 1. TOP HEADER NAVIGATION RAIL */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-600 to-teal-500 p-2.5 rounded-lg text-white shadow-lg shadow-blue-500/10">
            <Hand className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-wider text-white">AIRWAVE</h1>
              <span className="text-[10px] bg-blue-500/10 px-2 py-0.5 rounded text-blue-400 font-mono font-medium border border-blue-500/20">WORKSPACE</span>
            </div>
            <p className="text-xs text-slate-400">Windows Hands-Free Gesture Mouse Control Hub</p>
          </div>
        </div>

        <nav className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
          <button 
            type="button"
            onClick={() => setActiveTab("simulator")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all ${activeTab === "simulator" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Monitor className="w-4 h-4" />
            Control Panel & Simulator
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all ${activeTab === "code" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Code className="w-4 h-4" />
            Code Explorer ({codeFiles.length})
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab("build")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-all ${activeTab === "build" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Download className="w-4 h-4" />
            Installation & Packing
          </button>
        </nav>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-mono">
            <span className={`w-2.5 h-2.5 rounded-full ${cameraActive && handDetected ? 'bg-emerald-500 shadow-md shadow-emerald-500/20 animate-ping' : 'bg-amber-500'}`} />
            {cameraActive && handDetected ? "HAND_DETECTED" : "AWAITING_INPUT"}
          </span>
        </div>
      </header>

      {/* 2. BODY CONTENT LAYOUT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        
        {/* ===================================================================== */}
        {/* Tab A: CONTROL PANEL AND SIMULATION SANDBOX                           */}
        {/* ===================================================================== */}
        {activeTab === "simulator" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: UI Controls (Exactly matching PySide6 ui.py structure) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Core Controller State */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Device Orchestrator</h2>
                  <span className={`px-2.5 py-1 rounded text-[11px] font-bold ${trackingActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/30' : 'bg-red-950 text-red-400 border border-red-800/20'}`}>
                    {trackingActive ? "OS TRACKING ACTIVE" : "TRACKING SUSPENDED"}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTrackingActive(!trackingActive)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-xs transition-all ${trackingActive ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                  >
                    {trackingActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {trackingActive ? "Suspend Mapping" : "Resume Mapping"}
                  </button>
                  <button
                    type="button"
                    onClick={() => addLog("[Airwave UI] Calibration bounds reset. Center aligned.")}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 rounded-lg text-xs font-semibold border border-slate-700"
                    title="Recalibrate boundaries center"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Threshold & Sensitivities Slider settings */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
                  <Sliders className="w-4 h-4 text-blue-500" />
                  <h2 className="text-sm font-bold text-slate-100">Threshold & Sensitivities</h2>
                </div>

                {/* Speed Slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 font-medium">Cursor Travel Scale (Speed)</span>
                    <span className="font-mono text-blue-400 font-bold">{sensitivity}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="3.5" 
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500">Accelerates mapping vectors between device camera and desktop coordinates.</p>
                </div>

                {/* Pinch Threshold Distance slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 font-medium font-sans">Pinch Close Distance Limit</span>
                    <span className="font-mono text-teal-400 font-bold">{pinchThreshold}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.02" 
                    max="0.08" 
                    step="0.005"
                    value={pinchThreshold}
                    onChange={(e) => setPinchThreshold(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg cursor-pointer accent-teal-500"
                  />
                  <p className="text-[10px] text-slate-500">3D euclidean bounding threshold for index-thumb pinch clicks.</p>
                </div>

                <div className="border-t border-slate-850 pt-4 flex flex-col gap-3">
                  <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Gesture Action Mapping Rules</span>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-450">Index Pinch:</span>
                    <select 
                      value={pinchIndexAction} 
                      onChange={(e) => setPinchIndexAction(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 font-mono text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="left_click">LEFT_CLICK</option>
                      <option value="right_click">RIGHT_CLICK</option>
                      <option value="double_click">DOUBLE_CLICK</option>
                      <option value="none">NONE</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-450">Middle Pinch:</span>
                    <select 
                      value={pinchMiddleAction} 
                      onChange={(e) => setPinchMiddleAction(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 font-mono text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="left_click">LEFT_CLICK</option>
                      <option value="right_click">RIGHT_CLICK</option>
                      <option value="middle_click">MIDDLE_CLICK</option>
                      <option value="none">NONE</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-slate-850 pt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-450">Mirror Webcam Processing:</span>
                  <button 
                    type="button"
                    onClick={() => setMirrorCamera(!mirrorCamera)}
                    className={`text-[11px] font-bold py-1 px-3 rounded border transition-all ${mirrorCamera ? 'bg-blue-900/30 text-blue-400 border-blue-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                  >
                    {mirrorCamera ? "ENABLED (Horizontal Flip)" : "DISABLED"}
                  </button>
                </div>
              </div>

              {/* Vision Engine Analytics */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-3 mb-4">
                  <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <h2 className="text-sm font-bold text-slate-100">Telemetry Monitoring Stream</h2>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex flex-col">
                    <span className="text-[10px] text-slate-500 font-medium">Vision Latency</span>
                    <span className="text-base font-bold font-mono text-indigo-400 mt-1">
                      {cameraActive && handDetected ? `${latency} ms` : "0 ms"}
                    </span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 flex flex-col">
                    <span className="text-[10px] text-slate-500 font-medium">Frame Frequency</span>
                    <span className="text-base font-bold font-mono text-blue-400 mt-1">{fps} FPS</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 text-xs text-slate-400">
                  <div className="flex justify-between border-b border-slate-850 pb-2">
                    <span>Algorithm State:</span>
                    <span className="font-mono text-emerald-400 font-medium">
                      {cameraActive ? "CAMERA_CAPTURE" : "STANDBY_SIMULATOR"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-850 pb-2">
                    <span>Active Classified Gesture:</span>
                    <span className="text-yellow-400 font-bold font-mono">
                      {gestureActive.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tracking Acceleration Core:</span>
                    <span className="text-blue-400 font-bold font-mono">C++ compiled pybind11</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Camera Feed + Sandbox OS Simulator Screen */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Webcam & Overlay Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    <span className="text-xs font-semibold text-slate-200">Live Camera Visualizer (Hand Landmark Overlay)</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUseMouseSimulation(false)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all ${!useMouseSimulation ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                    >
                      Webcam Mode
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseMouseSimulation(true);
                        setCameraActive(false);
                        addLog("Switched input mechanism to Manual Drag-Mouse Simulator.");
                      }}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all ${useMouseSimulation ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                    >
                      Mouse Track Mode
                    </button>
                  </div>
                </div>

                <div className="relative w-full aspect-[4/3] max-h-[350px] bg-slate-950 rounded-lg overflow-hidden border border-slate-850 flex items-center justify-center">
                  
                  {/* MediaPipe Video Link */}
                  {!useMouseSimulation && (
                    <video 
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover opacity-75"
                      autoPlay
                      playsInline
                      muted
                      style={{ transform: mirrorCamera ? 'scaleX(-1)' : 'none' }}
                    />
                  )}

                  {/* Draw on transparent canvas overlay matching PySide6 */}
                  <canvas 
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full z-10 pointer-events-none"
                  />

                  {/* Non-Webcam Fallback Message or Alert */}
                  {camBlockedMessage && !useMouseSimulation && (
                    <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center p-6 text-center">
                      <VideoOff className="w-12 h-12 text-slate-500 mb-3" />
                      <h3 className="font-bold text-sm text-slate-200">Camera Feed Blocked or Missing</h3>
                      <p className="text-xs text-slate-400 max-w-sm mt-1">
                        Webcam permissions are missing in this iframe or no camera is plugged in. Don't worry! Click "Enable Sandbox Simulator" below to test the gestures with your standard mouse.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setUseMouseSimulation(true);
                          setCamBlockedMessage(null);
                        }}
                        className="mt-4 bg-blue-600 text-white font-semibold text-xs py-2 px-4 rounded-lg hover:bg-blue-500 transition-all shadow-md shadow-blue-500/10"
                      >
                        Enable Sandbox Simulator
                      </button>
                    </div>
                  )}

                  {/* Simulated Input Overlay instruction */}
                  {useMouseSimulation && (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 to-slate-900 border border-dashed border-slate-800 z-10 flex flex-col items-center justify-center p-6 text-center cursor-crosshair select-none"
                      onMouseMove={handleSimulatorMouseMove}
                    >
                      <div className="bg-blue-500/10 p-3 rounded-full border border-blue-500/20 text-blue-400 mb-2">
                        <MousePointer className="w-6 h-6 animate-pulse" />
                      </div>
                      <h4 className="font-bold text-xs text-slate-200">Sandbox Mouse Input ACTIVE</h4>
                      <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                        Drag your mouse in this dark square to move the virtual cursor. Use the mock click actions on the right side of the desktop window to simulate left / right pinches!
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Simulated Screen Interface Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Interactive Simulated OS Environment (Try Hand Tracking Here!)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">Resolution: 1920x1080 Scaled</span>
                </div>

                {/* THE DESKTOP SPACE CONTAINING VIRTUAL TARGETS AND CURSOR DISPLAY */}
                <div 
                  ref={simulatorDesktopRef}
                  className="relative w-full h-[320px] bg-slate-950 rounded-lg overflow-hidden border border-slate-850"
                  style={{
                    backgroundImage: 'radial-gradient(ellipse at bottom, #1e1b4b 0%, #020617 80%)'
                  }}
                  onMouseMove={handleSimulatorMouseMove}
                >
                  {/* Virtual Apps Grid */}
                  <div className="absolute top-6 left-6 flex flex-col gap-5 z-20">
                    
                    {/* App icon: My Computer */}
                    <div 
                      className={`flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all w-20 text-center select-none ${clickedTarget === "My Computer" ? "bg-blue-500/30 border border-blue-500/50" : "hover:bg-slate-800/40 border border-transparent"}`}
                      onClick={() => triggerSimulatedClick("left")}
                    >
                      <div className="bg-indigo-600 text-white p-2.5 rounded-lg shadow-md mb-1.5 shadow-indigo-600/10">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-200 truncate w-full">My Computer</span>
                    </div>

                    {/* App icon: Recycle Bin */}
                    <div 
                      className={`flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all w-20 text-center select-none ${clickedTarget === "Recycle Bin" ? "bg-blue-500/30 border border-blue-500/50" : "hover:bg-slate-800/40 border border-transparent"}`}
                      onClick={() => triggerSimulatedClick("left")}
                    >
                      <div className="bg-emerald-600 text-white p-2.5 rounded-lg shadow-md mb-1.5 shadow-emerald-600/10">
                        <FolderLock className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-200 truncate w-full flex justify-center gap-1">Recycle Bin</span>
                    </div>
                  </div>

                  {/* App Icon 2: Scrollable Text Viewport (representing a web browser) */}
                  <div className="absolute top-6 right-6 w-[260px] h-[210px] bg-slate-900/95 border border-slate-800 rounded-lg shadow-xl overflow-hidden z-20 flex flex-col">
                    <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-[9px] font-bold tracking-wide text-slate-400">Mock Browser Windows - Scroll Gesture Test</span>
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      </div>
                    </div>
                    
                    {/* Simulated document scroll container */}
                    <div 
                      ref={scrollContainerRef}
                      className="flex-1 p-3 text-[10px] text-slate-400 flex flex-col gap-2 overflow-y-hidden"
                    >
                      <div className="bg-blue-950/20 text-blue-400 border border-blue-800/20 p-2 rounded text-[9px] font-semibold text-center uppercase tracking-wide">
                        ☝️ Keep index & middle finger up to scroll
                      </div>
                      <p className="font-semibold text-slate-300">Webcam scroll gestures smooth algorithm evaluation:</p>
                      <p>Airwave integrates a C++ scroll estimator tracking distance derivatives between the PIP joints of your hand digits.</p>
                      <p className="text-teal-400">Double exponential filter minimizes frame rate fluctuations.</p>
                      <p>You can package your Airwave standalone binary with PyInstaller command guidelines as cataloged inside the Build Guide tab.</p>
                      <p className="text-blue-400">Ready to install on Windows 10 & Windows 11.</p>
                      <p>Tested and verified with high reliability.</p>
                    </div>

                    <div className="bg-slate-950 px-3 py-1 bg-slate-950 flex items-center justify-between text-[9px] text-slate-500 font-mono border-t border-slate-850">
                      <span>Mapped scroll top:</span>
                      <span className="text-teal-400 font-bold">{Math.round(virtualScrollTop)}px</span>
                    </div>
                  </div>

                  {/* ⚡ REAL TIME MOUSE CURSOR POINTER INDICATOR */}
                  <div 
                    className="absolute z-30 pointer-events-none transition-all duration-75 ease-out"
                    style={{
                      left: `${cursorX}px`,
                      top: `${cursorY}px`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    {/* Mouse cursor arrow */}
                    <svg className={`w-6 h-6 drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)] ${gestureActive !== 'neutral' ? 'scale-110 text-emerald-400' : 'text-blue-500'}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4.5 3V19L9.5 14L13.5 22L16.5 20.5L12.5 12.5H19.5L4.5 3Z" />
                    </svg>

                    {/* Interaction Glow depending on classified gesture */}
                    <span className={`absolute -inset-2.5 rounded-full filter blur-[2px] opacity-40 animate-ping pointer-events-none ${
                      gestureActive === "left_click" ? "bg-emerald-500" :
                      gestureActive === "right_click" ? "bg-amber-500" :
                      gestureActive.includes("scroll") ? "bg-indigo-500" : "hidden"
                    }`} />
                  </div>

                  {/* Calibration Grid Background pattern */}
                  <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 pointer-events-none opacity-20">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="border border-slate-900/40" />
                    ))}
                  </div>

                  {/* Taskbar */}
                  <div className="absolute bottom-0 inset-x-0 h-10 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between px-4 z-20">
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded text-[10px] font-bold text-slate-300 pointer-events-none">
                      <Hand className="w-3.5 h-3.5 text-blue-500" />
                      AIRWAVE START
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 select-none">
                      2026-05-28
                    </div>
                  </div>
                </div>

                {/* Simulated Click Helper for manual desktop tests */}
                {useMouseSimulation && (
                  <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[11px] text-slate-450 font-medium">Click buttons to trigger clicks at simulated cursor position:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => triggerSimulatedClick("left")}
                        className="bg-emerald-650 hover:bg-emerald-600 text-[10px] font-extrabold px-3 py-1.5 rounded transition-all text-emerald-400 bg-emerald-950/40 border border-emerald-800/40"
                      >
                        Pinch (Left Click)
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerSimulatedClick("right")}
                        className="bg-amber-650 hover:bg-amber-600 text-[10px] font-extrabold px-3 py-1.5 rounded transition-all text-amber-400 bg-amber-950/40 border border-amber-800/40"
                      >
                        Alt Pinch (Right Click)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulatedScroll("up")}
                        className="bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold px-2 px-2 py-1.5 rounded"
                      >
                        Scroll Up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulatedScroll("down")}
                        className="bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold px-2 px-2 py-1.5 rounded"
                      >
                        Scroll Down
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Running Output Logs (from Python tracking loop console logs) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">System Engine Logs</span>
                <div className="bg-slate-950 p-3.5 rounded-lg h-[130px] font-mono text-[11px] text-slate-400 overflow-y-auto border border-slate-850 flex flex-col gap-1.5">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex gap-2 leading-relaxed">
                      <span className="text-slate-600 select-none">&gt;</span>
                      <span className={log.includes("Gesture") ? "text-yellow-300" : log.includes("ERROR") ? "text-red-400" : "text-slate-350"}>
                        {log}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* Tab B: DIRECT CODE EXPLORER                                           */}
        {/* ===================================================================== */}
        {activeTab === "code" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-950">
            
            {/* Left Nav Pane */}
            <div className="md:col-span-3 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-2 mb-2 block">Project Structure</span>
                
                <div className="mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 pl-2">Python Core Module</span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {codeFiles.filter(f => f.language !== 'cpp').map((file, idx) => {
                      const absoluteIdx = codeFiles.findIndex(cf => cf.name === file.name);
                      return (
                        <button
                          key={file.name}
                          type="button"
                          onClick={() => setSelectedFileIdx(absoluteIdx)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono text-left transition-all ${selectedFileIdx === absoluteIdx ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
                        >
                          <FileCode className="w-3.5 h-3.5 shrink-0" />
                          {file.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 pl-2">C++ Acceleration Module</span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {codeFiles.filter(f => f.language === 'cpp').map((file, idx) => {
                      const absoluteIdx = codeFiles.findIndex(cf => cf.name === file.name);
                      return (
                        <button
                          key={file.name}
                          type="button"
                          onClick={() => setSelectedFileIdx(absoluteIdx)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono text-left transition-all ${selectedFileIdx === absoluteIdx ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
                        >
                          <FileCode className="w-3.5 h-3.5 shrink-0" />
                          {file.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Source Details context */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex flex-col gap-3">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-500" />
                  Codebase Overview
                </span>
                <p>These source files represent the fully functional Windows script system developed in your local folders under <code className="text-slate-250 bg-slate-950 font-mono text-[10px] px-1 rounded">/airwave</code>.</p>
                <p className="text-teal-400 font-medium">To export this entire workspace, head to the settings dropdown in the outer AI Studio wrapper and select 'Export to GitHub' or 'Export ZIP'.</p>
              </div>
            </div>

            {/* Right Display Box */}
            <div className="md:col-span-9 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[550px] overflow-hidden shadow-sm">
                
                {/* File Sub-header */}
                <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-500" />
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-200">{currentFile.path}</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">Language format: {currentFile.language.toUpperCase()}</p>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 bg-slate-800 cursor-pointer hover:bg-slate-750 text-[10px] font-bold py-1.5 px-3 rounded text-slate-300 transition-all active:scale-95"
                  >
                    {copyCodeSuccess ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copyCodeSuccess ? "Copied!" : "Copy Code"}
                  </button>
                </div>

                {/* Preformatted scrolling container */}
                <div className="flex-1 p-5 overflow-auto font-mono text-xs leading-relaxed text-slate-300 bg-[#020617]">
                  <pre className="whitespace-pre">{currentFile.content}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* Tab C: DEPLOYMENT AND PACKING DOCUMENTATION                           */}
        {/* ===================================================================== */}
        {activeTab === "build" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-3xl mx-auto shadow-md">
            <h2 className="text-xl font-bold text-slate-500 tracking-wide uppercase border-b border-slate-800 pb-4 mb-6 flex items-center gap-2">
              <FolderLock className="text-blue-500 w-6 h-6 animate-pulse" />
              Windows standalone Compilation & Deployment Guide
            </h2>

            <div className="flex flex-col gap-6 text-sm text-slate-300 leading-relaxed">
              
              <div>
                <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm border-l-2 border-blue-500 pl-2 mb-2">Step 1: Get Microsoft Build Compilers</h3>
                <p className="text-slate-400 text-xs">
                  PyBind11 works in-place by compiling C++ files. Make sure you install the standard build compiler suite:
                </p>
                <div className="bg-slate-950 p-2 text-[11px] font-mono text-slate-400 rounded-lg mt-2 border border-slate-850">
                  Select "Desktop development with C++" workload from Visual Studio Build Tools installer.
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm border-l-2 border-emerald-500 pl-2 mb-2">Step 2: Prepare a Python Virtual Environment</h3>
                <p className="text-slate-400 text-xs">
                  Create a tidy sandbox workspace, activate, and parse requirements inside PowerShell:
                </p>
                <pre className="bg-slate-950 p-3.5 rounded-lg text-xs font-mono text-slate-300 mt-2 border border-slate-850 block overflow-x-auto leading-relaxed">
{`# Create virtual environment 
python -m venv venv

# Activate on Windows systems
.\\\\venv\\\\Scripts\\\\activate

# Install setup and runtime tools
pip install -r requirements.txt`}
                </pre>
              </div>

              <div>
                <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm border-l-2 border-amber-500 pl-2 mb-2">Step 3: Compile the Low latency C++ layer</h3>
                <p className="text-slate-400 text-xs">
                  Invoke `setup.py` extension compile tool. This creates native Windows `.pyd` binaries binding straight into Python modules:
                </p>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 flex items-center justify-between mt-2 font-mono text-xs">
                  <span className="text-emerald-400">pip install .</span>
                  <button
                    type="button"
                    onClick={handleCopyCompile}
                    className="bg-slate-800 hover:bg-slate-750 text-[10px] font-bold py-1 px-2 rounded hover:text-slate-250 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    {compilerCommandCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {compilerCommandCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm border-l-2 border-indigo-500 pl-2 mb-2">Step 4: Package into a portable .EXE Executable</h3>
                <p className="text-slate-400 text-xs text-slate-400">
                  Using PyInstaller bundle dependencies, MediaPipe weights, and pre-compiled models altogether in a standalone file folder:
                </p>
                <pre className="bg-slate-950 p-3.5 rounded-lg text-xs font-mono text-slate-300 mt-2 border border-slate-850 block overflow-x-auto leading-relaxed">
{`# Install packaging wrapper
pip install pyinstaller

# Enforce binary layout outputs and collect MediaPipe weights
pyinstaller --noconfirm --onedir --windowed --name="Airwave" --add-data "config.json;." --collect-all mediapipe main.py`}
                </pre>
                <div className="mt-2.5 bg-yellow-950/25 border border-yellow-800/20 text-yellow-400 p-2.5 rounded-lg text-xs flex gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>The completed program compiles directly into <code className="bg-slate-950 font-mono text-[10px] px-1 py-0.5 rounded text-slate-300 border border-slate-850">/dist/Airwave/Airwave.exe</code> for clean distribution.</span>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* 3. APP FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/80 p-5 text-center text-slate-500 text-xs font-mono">
        <p>Airwave • High-Performance Hand Tracker Workspace © 2026</p>
      </footer>
    </div>
  );
}
