import * as THREE from 'three';
import { AudioSystem } from './audio-engine.js';

// --- CONFIG ---
const audio = new AudioSystem(4096);

// --- GLOBALS ---
let scene, camera, renderer;
let scopeGeometry, scopePoints, scopeMaterial;
let isRunning = false;
let isPaused = false;

// Theme Globals
let currentFG = '#00ff00';
let currentDim = '#004400';

// Canvas Refs
const specCanvas = document.getElementById('spectrum-canvas');
const specCtx = specCanvas.getContext('2d');

// --- INIT SEQUENCE ---
initGraphics();
setupInteraction();
animate();

// --- THREE.JS GRAPHICS ---
function initGraphics() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 2;
    camera = new THREE.OrthographicCamera(
        -frustumSize * aspect, frustumSize * aspect, 
        frustumSize, -frustumSize, 
        0.1, 100
    );
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Insert canvas BEFORE the UI layer so UI stays on top
    document.body.insertBefore(renderer.domElement, document.getElementById('ui-grid'));

    // VECTORSCOPE GEOMETRY
    const positions = new Float32Array(audio.samples * 3);
    scopeGeometry = new THREE.BufferGeometry();
    scopeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    scopeMaterial = new THREE.PointsMaterial({
        color: currentFG,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    scopePoints = new THREE.Points(scopeGeometry, scopeMaterial);
    scene.add(scopePoints);

    // GRID
    const gridHelper = new THREE.GridHelper(4, 4, 0x111111, 0x111111);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    
    window.addEventListener('resize', onResize);
    onResize();
}

// --- INTERACTION & LOGIC ---
function setupInteraction() {
    const drop = document.getElementById('drop-overlay');
    const fileIn = document.getElementById('file-input');
    const btnMic = document.getElementById('btn-mic');
    const btnPause = document.getElementById('btn-pause');
    const btnReset = document.getElementById('btn-reset');
    
    // Theme buttons
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            setTheme(dot.dataset.fg, dot.dataset.dim);
        });
    });

    // Export buttons
    document.getElementById('btn-export-sq').addEventListener('click', () => exportSnapshot(1080, 1080));
    document.getElementById('btn-export-vt').addEventListener('click', () => exportSnapshot(1080, 1920));

    // Drag & Drop / File Input
    drop.addEventListener('click', () => fileIn.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.background = '#002200'; });
    drop.addEventListener('dragleave', e => { e.preventDefault(); drop.style.background = 'rgba(0,0,0,0.85)'; });
    drop.addEventListener('drop', e => {
        e.preventDefault();
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileIn.addEventListener('change', e => { if(e.target.files.length) handleFile(e.target.files[0]); });

    // Buttons
    btnMic.addEventListener('click', activateMic);
    btnReset.addEventListener('click', () => location.reload());
    btnPause.addEventListener('click', togglePause);
}

async function handleFile(file) {
    await audio.init();
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const buffer = await audio.decodeFile(e.target.result);
            // Stop previous if exists
            if(audio.sourceNode) { try{ audio.sourceNode.stop(); } catch(e){} }
            
            const src = audio.createBufferSource(buffer);
            src.start(0);
            audio.setupNodes(src);
            
            isRunning = true;
            document.getElementById('drop-overlay').classList.add('hidden');
        } catch(err) {
            console.error("Audio Decode Error:", err);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function activateMic() {
    await audio.init();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src = audio.createStreamSource(stream);
        audio.setupNodes(src);
        isRunning = true;
        document.getElementById('drop-overlay').classList.add('hidden');
    } catch(err) {
        console.error("Mic Access Error:", err);
    }
}

// --- APP FUNCTIONS (Ported from Original) ---

function togglePause() {
    if(!audio.ctx) return;
    const exportPanel = document.getElementById('export-panel');
    const btn = document.getElementById('btn-pause');
    
    if(audio.state === 'running') {
        audio.suspend();
        isPaused = true;
        btn.style.background = 'var(--fg)';
        btn.style.color = 'var(--bg)';
        btn.innerText = "RESUME";
        exportPanel.classList.add('visible');
    } else {
        audio.resume();
        isPaused = false;
        btn.style.background = '';
        btn.style.color = 'var(--fg)';
        btn.innerText = "PAUSE";
        exportPanel.classList.remove('visible');
    }
}

function setTheme(fg, dim) {
    currentFG = fg;
    currentDim = dim;
    
    // CSS Vars
    document.documentElement.style.setProperty('--fg', fg);
    document.documentElement.style.setProperty('--dim', dim);
    
    // Three JS Update
    if(scopeMaterial) scopeMaterial.color.set(fg);
    
    // Re-render immediately if paused
    if(isPaused) renderer.render(scene, camera);
}

function exportSnapshot(width, height) {
    if (!renderer) return;

    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);
    
    // Resize to target
    renderer.setSize(width, height);
    
    // Update Camera aspect
    const aspect = width / height;
    const frustum = 2;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.updateProjectionMatrix();

    // Render
    renderer.render(scene, camera);

    // Capture
    const dataURL = renderer.domElement.toDataURL('image/png');
    
    // Download
    const link = document.createElement('a');
    link.download = `CONSTELLATION_EXPORT_${width}x${height}_${Date.now()}.png`;
    link.href = dataURL;
    link.click();

    // Restore
    renderer.setSize(originalSize.width, originalSize.height);
    onResize(); // Resets camera
    renderer.render(scene, camera);
}

// --- CALCULATIONS ---

function toDB(gain) {
    return 20 * Math.log10(Math.max(gain, 0.00001));
}

function calculateMetrics(lData, rData) {
    let sumL = 0, sumR = 0;
    let sumLR = 0, sumL2 = 0, sumR2 = 0;
    let peakL = 0, peakR = 0;

    for(let i=0; i<lData.length; i++) {
        const l = lData[i];
        const r = rData[i];
        
        sumL += l * l;
        sumR += r * r;
        sumLR += l * r;
        sumL2 += l * l;
        sumR2 += r * r;

        if(Math.abs(l) > peakL) peakL = Math.abs(l);
        if(Math.abs(r) > peakR) peakR = Math.abs(r);
    }

    const rmsL = Math.sqrt(sumL / lData.length);
    const rmsR = Math.sqrt(sumR / rData.length);
    const rmsTotal = (rmsL + rmsR) / 2;

    const denom = Math.sqrt(sumL2 * sumR2);
    let correlation = denom > 0.00001 ? sumLR / denom : 0;
    correlation = Math.max(-1, Math.min(1, correlation));

    return { rmsL, rmsR, rmsTotal, correlation, peakL, peakR };
}

function drawSpectrum() {
    if(!audio.analyserSpec) return;
    
    const w = specCanvas.width;
    const h = specCanvas.height;
    specCtx.clearRect(0, 0, w, h);

    // Get data from audio engine yes
    const freqData = audio.freqData;
    
    specCtx.beginPath();
    specCtx.strokeStyle = currentFG;
    specCtx.lineWidth = 1;
    specCtx.fillStyle = currentDim;
    
    const sliceWidth = w * 1.0 / freqData.length;
    let x = 0;

    specCtx.moveTo(0, h);
    
    for(let i = 0; i < freqData.length; i++) {
        const v = freqData[i] / 255.0;
        const y = h - (v * h);
        specCtx.lineTo(x, y);
        x += sliceWidth;
    }
    
    specCtx.lineTo(w, h);
    specCtx.fill();
    specCtx.stroke();
    
    // Grid markers
    specCtx.fillStyle = currentFG;
    specCtx.font = "10px JetBrains Mono";
    specCtx.globalAlpha = 0.5;
    specCtx.fillText("20Hz", 10, h - 5);
    specCtx.fillText("20kHz", w - 40, h - 5);
    specCtx.globalAlpha = 1.0;
}

// --- MAIN LOOP ---

function animate() {
    requestAnimationFrame(animate);

    if (isRunning && !isPaused && audio.updateData()) {
        const dataL = audio.dataL;
        const dataR = audio.dataR;

        // 1. UPDATE VECTORSCOPE
        const positions = scopeGeometry.attributes.position.array;
        for (let i = 0; i < audio.samples; i++) {
            const l = dataL[i];
            const r = dataR[i];
            // Rotate 45deg: X = (L-R), Y = (L+R)
            const x = (l - r) * 1.0; 
            const y = (l + r) * 1.0; 
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = 0;
        }
        scopeGeometry.attributes.position.needsUpdate = true;

        // 2. UPDATE UI METRICS
        const m = calculateMetrics(dataL, dataR);

        // DB
        const db = toDB(m.rmsTotal).toFixed(1);
        document.getElementById('val-db').innerText = db + " dB";

        // Bars
        const mapDB = (val) => Math.min(100, Math.max(0, (toDB(val) + 60) * (100/60)));
        document.getElementById('bar-l').style.width = mapDB(m.rmsL) + "%";
        document.getElementById('bar-r').style.width = mapDB(m.rmsR) + "%";

        // Clipping
        const clipEl = document.getElementById('clip-led');
        if (m.peakL >= 0.99 || m.peakR >= 0.99) {
            clipEl.classList.add('active');
            clipEl.style.opacity = "1";
        } else {
            clipEl.classList.remove('active');
        }

        // Correlation
        const corrPercent = ((m.correlation + 1) / 2) * 100;
        document.getElementById('corr-marker').style.left = corrPercent + "%";
        document.getElementById('val-corr').innerText = (m.correlation > 0 ? "+" : "") + m.correlation.toFixed(2);
        
        if (m.correlation < 0) {
            document.getElementById('val-corr').style.color = 'var(--alert)';
            document.getElementById('corr-marker').style.background = 'var(--alert)';
        } else {
            document.getElementById('val-corr').style.color = 'var(--fg)';
            document.getElementById('corr-marker').style.background = '#fff';
        }

        // Width
        const width = Math.max(0, (1 - m.correlation) * 50).toFixed(0);
        document.getElementById('val-width').innerText = width + "%";

        // 3. DRAW SPECTRUM
        drawSpectrum();
    }

    renderer.render(scene, camera);
}

function onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 2;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Resize Spectrum Canvas
    const container = document.getElementById('spectrum-container');
    if(container) {
        specCanvas.width = container.clientWidth;
        specCanvas.height = container.clientHeight;
    }
}
