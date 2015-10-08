/* Copyright 2013 Chris Wilson

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();
var audioInput = null,
    realAudioInput = null,
    inputPoint = null,
    meter = null,
    audioRecorder = null;

var dryGain = audioContext.createGain();
var wetGain = audioContext.createGain();

var rafID = null;
var analyserContext = null;
var canvasWidth, canvasHeight;
// var recIndex = 0;
var next_rec_start_time = 0;

var jungleEffect = new Jungle(audioContext);

/* TODO:

- offer mono option
- "Monitor input" switch
*/

function crossfade(value) {
  // equal-power crossfade
  var gain1 = Math.cos(value * 0.5*Math.PI);
  var gain2 = Math.cos((1.0-value) * 0.5*Math.PI);

  dryGain.gain.value = gain1;
  wetGain.gain.value = gain2;
}

function gotBuffers(buffers) {
    // console.log(buffers);
    // console.log(buffers[0].length/ audioContext.sampleRate);
    next_rec_start_time += (buffers[0].length/ audioContext.sampleRate)*1000+500;
    setTimeout(function(){
        document.getElementById("cat1").style.display = "none";
        document.getElementById("cat2").style.display = "block";
    }, (buffers[0].length/ audioContext.sampleRate)*1000);
    var buffer = audioContext.createBuffer(2, buffers[0].length, audioContext.sampleRate);
    buffer.copyToChannel(buffers[0], 0, 0);
    buffer.copyToChannel(buffers[1], 1, 0);

    jungleEffect.output.connect(audioContext.destination);
    jungleEffect.setPitchOffset(0.75);

    // wetGain.connect(jungleEffect.input);
    // dryGain.connect(jungleEffect.input);
    // crossfade(0);

    var source = audioContext.createBufferSource();
    source.buffer = buffer;
    // source.connect(dryGain);
    // source.connect(wetGain);
    source.connect(jungleEffect.input);
    source.start();

    // var canvas = document.getElementById( "wavedisplay" );
    // drawBuffer( canvas.width, canvas.height, canvas.getContext('2d'), buffers[0] );

    // the ONLY time gotBuffers is called is right after a new recording is completed -
    // so here's where we should set up the download.
    // audioRecorder.exportWAV( doneEncoding );
}

// function doneEncoding(blob) {
    // Recorder.setupDownload( blob, "myRecording" + ((recIndex<10)?"0":"") + recIndex + ".wav" );
    // recIndex++;
    // alert(recIndex);
// }

// function toggleRecording(e) {
//     if (e.classList.contains("recording")) {
//         // stop recording
//         audioRecorder.stop();
//         e.classList.remove("recording");
//         audioRecorder.getBuffers(gotBuffers);
//     } else {
//         // start recording
//         if (!audioRecorder)
//             return;
//         e.classList.add("recording");
//         audioRecorder.clear();
//         audioRecorder.record();
//     }
// }

// function convertToMono(input) {
//     var splitter = audioContext.createChannelSplitter(2);
//     var merger = audioContext.createChannelMerger(2);
//
//     input.connect( splitter );
//     splitter.connect(merger, 0, 0);
//     splitter.connect(merger, 0, 1);
//     return merger;
// }

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame(rafID);
    rafID = null;
}

function updateAnalysers(time) {
    // console.log(time/1000);
    if (!audioRecorder)
        return;
    if (meter.checkClipping()) {
        if (next_rec_start_time < time && !audioRecorder.recording()){
            // e.classList.add("recording");
            // start recording
            audioRecorder.clear();
            audioRecorder.record();
            console.log("audioRecorder.record()");
            // document.getElementById("cat1").style.display = "block";
            // document.getElementById("cat2").style.display = "none";
        }
    } else {
        if (audioRecorder.recording()){
            next_rec_start_time = time;
            // e.classList.remove("recording");
            // stop recording
            audioRecorder.stop();
            console.log("play()");
            audioRecorder.getBuffers(gotBuffers);
            document.getElementById("cat1").style.display = "block";
            document.getElementById("cat2").style.display = "none";
        }
    }

    if (!analyserContext) {
        var canvas = document.getElementById("analyser");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analyserContext = canvas.getContext('2d');
    }

    // analyzer draw code here
    {
        var SPACING = 3;
        var BAR_WIDTH = 1;
        var numBars = Math.round(canvasWidth / SPACING);
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

        analyserNode.getByteFrequencyData(freqByteData);

        analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        analyserContext.fillStyle = '#F6D565';
        analyserContext.lineCap = 'round';
        var multiplier = analyserNode.frequencyBinCount / numBars;

        // Draw rectangle for each frequency bin.
        for (var i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (var j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
            magnitude = magnitude / multiplier;
            var magnitude2 = freqByteData[i * multiplier];
            analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }
    }

    rafID = window.requestAnimationFrame( updateAnalysers );
}

// function toggleMono() {
//     if (audioInput != realAudioInput) {
//         audioInput.disconnect();
//         realAudioInput.disconnect();
//         audioInput = realAudioInput;
//     } else {
//         realAudioInput.disconnect();
//         audioInput = convertToMono( realAudioInput );
//     }
//
//     audioInput.connect(inputPoint);
// }

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

//    audioInput = convertToMono( input );

    // Create a new volume meter and connect it.
    meter = createAudioMeter(audioContext, 0.08, 0.35, 1000);
    audioInput.connect(meter);

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );
    updateAnalysers();
}

function initAudio() {
        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

    navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
}

window.addEventListener('load', initAudio );
