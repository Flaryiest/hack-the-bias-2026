from flask import Flask
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import base64
import io
import json
import tempfile
import os
from src.recognition import recognize_sound, infer_sound_direction, calculate_motor_powers

app = Flask(__name__)
app.config['SECRET_KEY'] = 'yummy'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=10000000)

latest_images = {
    'front': None,
    'back': None
}

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

@socketio.on('audio_stream')
def handle_audio_stream(data):
    """Handle incoming audio stream and process it"""
    try:
        audio_base64 = data.get('audio')
        audio_format = data.get('format', 'webm')
        
        if not audio_base64:
            emit('error', {'message': 'No audio data received'})
            return
        
        audio_bytes = base64.b64decode(audio_base64)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{audio_format}') as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name
        
        try:
            sound_description = recognize_sound(temp_audio_path)
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
            os.unlink(temp_audio_path)
            
    except Exception as e:
        print(f"Error processing audio: {str(e)}")
        emit('error', {'message': str(e)})

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
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{audio_format}') as temp_audio, \
             tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_front, \
             tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_back:
            
            temp_audio.write(audio_bytes)
            temp_front.write(front_bytes)
            temp_back.write(back_bytes)
            
            temp_audio_path = temp_audio.name
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

if __name__ == "__main__":
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)