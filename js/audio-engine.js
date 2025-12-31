// Dedicated Audio System class to manage Context, Nodes, and Analysis Buffers
export class AudioSystem {
    constructor(sampleSize = 4096) {
        this.samples = sampleSize;
        this.ctx = null;
        this.sourceNode = null;
        
        // Analyzers
        this.analyserL = null;
        this.analyserR = null;
        this.analyserSpec = null;
        
        // Data Buffers
        this.dataL = null;
        this.dataR = null;
        this.freqData = null;
    }

    // Initialize the AudioContext (must be called after user interaction)
    async init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    // Setup the audio graph: Source -> Splitter -> Analysers -> Dest
    setupNodes(source) {
        // Disconnect old nodes if they exist
        if(this.sourceNode) { 
            try { this.sourceNode.disconnect(); } catch(e){} 
        }
        
        this.sourceNode = source;

        // Create Nodes
        const splitter = this.ctx.createChannelSplitter(2);
        this.analyserL = this.ctx.createAnalyser();
        this.analyserR = this.ctx.createAnalyser();
        this.analyserSpec = this.ctx.createAnalyser();

        // Vectorscope Config (Time Domain)
        this.analyserL.fftSize = this.samples * 2;
        this.analyserR.fftSize = this.samples * 2;
        
        // Spectrum Config (Frequency Domain)
        this.analyserSpec.fftSize = 2048; 
        this.analyserSpec.smoothingTimeConstant = 0.85;

        // Routing
        source.connect(splitter);
        splitter.connect(this.analyserL, 0); // Left to AnalyserL
        splitter.connect(this.analyserR, 1); // Right to AnalyserR
        
        source.connect(this.analyserSpec); // Mix to Spectrum

        // Connect to speakers if it's a file/buffer source (Microphone shouldn't echo back usually, but here we only handle buffer connection logic in Main or implicit)
        // Note: The caller (Main.js) decides if source connects to destination, 
        // but typically for file playback we do:
        if (source instanceof AudioBufferSourceNode) {
            source.connect(this.ctx.destination);
        }
        // If it's a MediaStream (Mic), we usually DON'T connect to destination to avoid feedback loops.

        // Initialize TypedArrays
        this.dataL = new Float32Array(this.samples);
        this.dataR = new Float32Array(this.samples);
        this.freqData = new Uint8Array(this.analyserSpec.frequencyBinCount);
    }

    // Helper to decode raw file data
    async decodeFile(arrayBuffer) {
        return await this.ctx.decodeAudioData(arrayBuffer);
    }

    // Helper to create a Buffer Source
    createBufferSource(buffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        return src;
    }

    // Helper to create Stream Source
    createStreamSource(stream) {
        return this.ctx.createMediaStreamSource(stream);
    }

    // Fill the buffers with current data
    updateData() {
        if(this.analyserL && this.analyserR && this.analyserSpec) {
            this.analyserL.getFloatTimeDomainData(this.dataL);
            this.analyserR.getFloatTimeDomainData(this.dataR);
            this.analyserSpec.getByteFrequencyData(this.freqData);
            return true;
        }
        return false;
    }

    // Suspend/Resume wrappers
    async suspend() { if(this.ctx) await this.ctx.suspend(); }
    async resume() { if(this.ctx) await this.ctx.resume(); }
    get state() { return this.ctx ? this.ctx.state : 'closed'; }
}