from flask import Flask, render_template
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import base64
import io
import json
import tempfile
import os
import subprocess
from src.recognition import recognize_sound, infer_sound_direction, calculate_motor_powers

app = Flask(__name__)
app.config['SECRET_KEY'] = 'yummy'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=10000000)

latest_images = {
    'front': None,
    'back': None
}

# Audio streaming buffers per client
audio_buffers = {}
streaming_active = {}

@app.route('/')
def index():
    return {'status': 'WebSocket server running', 'endpoint': '/socket.io'}

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connection_response', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('start_audio_stream')
def handle_start_audio_stream():
    """Start continuous audio streaming"""
    from flask import request
    client_id = request.sid
    audio_buffers[client_id] = bytearray()
    streaming_active[client_id] = True
    print(f"Started audio stream for client {client_id}")
    emit('stream_started', {'status': 'Audio streaming active'})

@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    """Handle incoming audio chunks from continuous stream"""
    from flask import request
    client_id = request.sid
    
    try:
        chunk_base64 = data.get('chunk')
        if not chunk_base64:
            return
        
        chunk_bytes = base64.b64decode(chunk_base64)
        
        if client_id not in audio_buffers:
            audio_buffers[client_id] = bytearray()
        
        audio_buffers[client_id].extend(chunk_bytes)
        
    except Exception as e:
        print(f"Error handling audio chunk: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('process_audio_buffer')
def handle_process_audio_buffer():
    """Process accumulated audio buffer"""
    from flask import request
    client_id = request.sid
    
    try:
        if client_id not in audio_buffers or len(audio_buffers[client_id]) == 0:
            emit('error', {'message': 'No audio data in buffer'})
            return
        
        audio_bytes = bytes(audio_buffers[client_id])
        
        # Save WebM audio
        temp_webm = tempfile.NamedTemporaryFile(delete=False, suffix='.webm')
        temp_webm.write(audio_bytes)
        temp_webm.close()
        temp_webm_path = temp_webm.name
        
        temp_wav_path = None
        
        try:
            # Convert WebM to WAV using ffmpeg (OpenAI only accepts wav/mp3)
            temp_wav = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
            temp_wav.close()
            temp_wav_path = temp_wav.name
            
            # Use ffmpeg to convert
            try:
                result = subprocess.run([
                    'ffmpeg', '-i', temp_webm_path, 
                    '-ar', '16000',  # 16kHz sample rate
                    '-ac', '1',       # mono
                    '-y',             # overwrite
                    temp_wav_path
                ], check=True, capture_output=True)
                audio_path = temp_wav_path
                print(f"Audio converted: {len(audio_bytes)} bytes webm -> wav")
            except FileNotFoundError:
                print("FFmpeg not available, skipping audio processing")
                emit('error', {'message': 'FFmpeg not installed. Please install FFmpeg for audio processing.'})
                return
            except subprocess.CalledProcessError as e:
                print(f"FFmpeg conversion failed: {e.stderr.decode() if e.stderr else 'unknown error'}")
                emit('error', {'message': 'Audio conversion failed'})
                return
            
            try:
                sound_description = recognize_sound(audio_path)
                print(f"Sound detected: {sound_description}")
                
                if latest_images['front'] is None or latest_images['back'] is None:
                    emit('result', {
                        'sound': sound_description,
                        'angle': None,
                        'motor_powers': None,
                        'error': 'Missing camera images. Please send both front and back images first.'
                    })
                    return
                
                with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_front:
                    temp_front.write(latest_images['front'])
                    temp_front_path = temp_front.name
                
                with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_back:
                    temp_back.write(latest_images['back'])
                    temp_back_path = temp_back.name
                
                try:
                    angle, detection_info = infer_sound_direction(
                        temp_front_path,
                        temp_back_path,
                        sound_description
                    )
                    
                    motor_powers = calculate_motor_powers(angle)
                    
                    result = {
                        'sound': sound_description,
                        'angle': round(angle, 2),
                        'motor_powers': motor_powers,
                        'detection_info': detection_info
                    }
                    
                    print(f"Result: {json.dumps(result, indent=2)}")
                    emit('result', result)
                    
                finally:
                    os.unlink(temp_front_path)
                    os.unlink(temp_back_path)
                    
            finally:
                if temp_wav_path and os.path.exists(temp_wav_path):
                    os.unlink(temp_wav_path)
                
        finally:
            if os.path.exists(temp_webm_path):
                os.unlink(temp_webm_path)
        
        # Clear buffer after processing
        audio_buffers[client_id] = bytearray()
        
    except Exception as e:
        print(f"Error processing audio buffer: {str(e)}")
        import traceback
        traceback.print_exc()
        emit('error', {'message': str(e)})

@socketio.on('stop_audio_stream')
def handle_stop_audio_stream():
    """Stop continuous audio streaming"""
    from flask import request
    client_id = request.sid
    
    if client_id in streaming_active:
        streaming_active[client_id] = False
    if client_id in audio_buffers:
        del audio_buffers[client_id]
    
    print(f"Stopped audio stream for client {client_id}")
    emit('stream_stopped', {'status': 'Audio streaming stopped'})

@socketio.on('image_stream')
def handle_image_stream(data):
    """Handle incoming image stream from cameras"""
    try:
        camera = data.get('camera')  # 'front' or 'back'
        image_base64 = data.get('image')
        
        if camera not in ['front', 'back']:
            emit('error', {'message': 'Invalid camera type. Use "front" or "back"'})
            return
        
        if not image_base64:
            emit('error', {'message': 'No image data received'})
            return
        
        image_bytes = base64.b64decode(image_base64)
        latest_images[camera] = image_bytes
        
        print(f"Received {camera} camera image: {len(image_bytes)} bytes")
        emit('image_received', {'camera': camera, 'size': len(image_bytes)})
        
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('process_all')
def handle_process_all(data):
    """Process audio with images in a single request"""
    try:
        audio_base64 = data.get('audio')
        audio_format = data.get('audio_format', 'webm')
        front_image_base64 = data.get('front_image')
        back_image_base64 = data.get('back_image')
        
        if not all([audio_base64, front_image_base64, back_image_base64]):
            emit('error', {'message': 'Missing audio or image data'})
            return
        
        audio_bytes = base64.b64decode(audio_base64)
        front_bytes = base64.b64decode(front_image_base64)
        back_bytes = base64.b64decode(back_image_base64)
        
        # Handle audio conversion for non-wav/mp3 formats
        if audio_format.lower() not in ['wav', 'mp3']:
            with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{audio_format}') as temp_input:
                temp_input.write(audio_bytes)
                temp_input_path = temp_input.name
            
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_wav:
                    temp_audio_path = temp_wav.name
                
                # Use ffmpeg to convert
                try:
                    subprocess.run([
                        'ffmpeg', '-i', temp_input_path,
                        '-ar', '16000', '-ac', '1', '-y',
                        temp_audio_path
                    ], check=True, capture_output=True)
                except (subprocess.CalledProcessError, FileNotFoundError):
                    print("FFmpeg not available, using original format")
                    temp_audio_path = temp_input_path
            finally:
                if temp_input_path != temp_audio_path and os.path.exists(temp_input_path):
                    os.unlink(temp_input_path)
        else:
            with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{audio_format}') as temp_audio:
                temp_audio.write(audio_bytes)
                temp_audio_path = temp_audio.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_front, \
             tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_back:
            
            temp_front.write(front_bytes)
            temp_back.write(back_bytes)
            
            temp_front_path = temp_front.name
            temp_back_path = temp_back.name
        
        try:
            sound_description = recognize_sound(temp_audio_path)
            angle, detection_info = infer_sound_direction(
                temp_front_path,
                temp_back_path,
                sound_description
            )
            motor_powers = calculate_motor_powers(angle)
            
            result = {
                'sound': sound_description,
                'angle': round(angle, 2),
                'motor_powers': motor_powers,
                'detection_info': detection_info
            }
            
            print(f"Complete result: {json.dumps(result, indent=2)}")
            emit('result', result)
            
        finally:
            os.unlink(temp_audio_path)
            os.unlink(temp_front_path)
            os.unlink(temp_back_path)
            
    except Exception as e:
        print(f"Error processing: {str(e)}")
        emit('error', {'message': str(e)})

@app.route("/example")
def example():
    return render_template("example.html")

if __name__ == "__main__":
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)