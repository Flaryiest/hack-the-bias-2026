import os
import base64
import json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def recognize_sound(audio_file_path: str) -> str:
    with open(audio_file_path, "rb") as audio_file:
        audio_data = base64.b64encode(audio_file.read()).decode('utf-8')

    file_ext = os.path.splitext(audio_file_path)[1].lower().replace('.', '')
    if file_ext == 'mp3':
        file_ext = 'mp3'
    
    response = client.chat.completions.create(
        model="gpt-4o-audio-preview",
        modalities=["text"],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Identify the PRIMARY sound source. Return ONLY 1–3 words. No explanation."
                    },
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": audio_data,
                            "format": file_ext
                        }
                    }
                ]
            }
        ]
    )

    return response.choices[0].message.content.strip()


def encode_image(path: str) -> str:

    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def calculate_angle_from_bbox(bbox_center_x: float, image_width: float, camera_fov: float = 80, camera_angle: float = 0) -> float:

    normalized_x = (bbox_center_x / image_width) - 0.5
    angle_offset = normalized_x * camera_fov
    
    absolute_angle = (camera_angle + angle_offset) % 360
    
    return absolute_angle

def infer_sound_direction(front_image_path: str, back_image_path: str, sound_description: str,) -> tuple[float, dict]:
    front_img = encode_image(front_image_path)
    back_img = encode_image(back_image_path)

    front_ext = os.path.splitext(front_image_path)[1].lower().replace('.', '')
    back_ext = os.path.splitext(back_image_path)[1].lower().replace('.', '')

    prompt = f"""
Sound: "{sound_description}"

You have TWO camera views:
- Image 1 (Front camera): Facing 0°, FOV 80° (covers -40° to +40°)
- Image 2 (Back camera): Facing 180°, FOV 80° (covers 140° to 220°)

Task:
1. Identify the object/source making the sound in EITHER image
2. Draw a bounding box around it
3. Report which image it's in and the bounding box coordinates

Rules:
- Return ONLY valid JSON
- If object found in FRONT image: "camera": "front"
- If object found in BACK image: "camera": "back"  
- If not found or uncertain: "camera": "none"
- Bounding box format: [x_min, y_min, x_max, y_max] in pixel coordinates
- Also provide image dimensions: [width, height]

Required format:
{{
  "camera": "front" | "back" | "none",
  "bbox": [x_min, y_min, x_max, y_max],
  "image_dimensions": [width, height],
  "confidence": "high" | "medium" | "low",
  "object_description": "brief description of what was found"
}}

Example:
{{
  "camera": "front",
  "bbox": [150, 200, 350, 450],
  "image_dimensions": [1920, 1080],
  "confidence": "high",
  "object_description": "bird on tree branch"
}}
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{front_ext};base64,{front_img}"
                        }
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{back_ext};base64,{back_img}"
                        }
                    }
                ]
            }
        ]
    )

    result = json.loads(response.choices[0].message.content)

    if result["camera"] == "none":
        return 0.0, result
    
    bbox = result["bbox"]
    img_width = result["image_dimensions"][0]
    
    bbox_center_x = (bbox[0] + bbox[2]) / 2
    
    camera_base_angle = 0 if result["camera"] == "front" else 180
    
    angle = calculate_angle_from_bbox(bbox_center_x, img_width, camera_fov=80, camera_angle=camera_base_angle)
    
    return angle, result


def calculate_motor_powers(angle: float, motor_positions: list = [60, 180, 300]) -> dict:
    import math

    angle = angle % 360
    
    distances = []
    for motor_angle in motor_positions:
        diff = abs(angle - motor_angle)
        if diff > 180:
            diff = 360 - diff
        distances.append(diff)

    weights = []
    for dist in distances:
        if dist == 0:
            return {
                f"motor_{motor_positions[0]}": 1.0 if distances[0] == 0 else 0.0,
                f"motor_{motor_positions[1]}": 1.0 if distances[1] == 0 else 0.0,
                f"motor_{motor_positions[2]}": 1.0 if distances[2] == 0 else 0.0
            }
        weights.append(1 / (dist ** 2))
    
    total_weight = sum(weights)
    powers = [w / total_weight for w in weights]
    
    return {
        f"motor_{motor_positions[0]}": round(powers[0], 3),
        f"motor_{motor_positions[1]}": round(powers[1], 3),
        f"motor_{motor_positions[2]}": round(powers[2], 3)
    }



def visualize_motor_powers(motor_powers: dict, angle: float):

    print("MOTOR CONTROL OUTPUTS")
    print(f"Target Angle: {angle:.1f}°\n")
    
    for motor_name, power in motor_powers.items():

        motor_angle = motor_name.split('_')[1]
        
        bar_length = int(power * 20)
        bar = "█" * bar_length + "░" * (20 - bar_length)
        
        print(f"{motor_name:12} ({motor_angle:>3}°): [{bar}] {power:.3f}")

    total = sum(motor_powers.values())
    print(f"\nTotal Power: {total:.3f} (should be ~1.0)")
    print("="*50)


def write_json(sound: str, angle: str, motor_powers: dict, path: str = "output.json"):
    output_json = {
        "sound": sound, 
        "angle": angle,
        "motor_powers":{
            "motor_60": motor_powers.get("motor_60"),
            "motor_180": motor_powers.get("motor_180"),
            "motor_300": motor_powers.get("motor_300")
        }
    }


    with open(path, 'w', encoding='utf-8') as f:
        json.dump(output_json, f, indent = 2, ensure_ascii=False)
    print(f"Results saved to {path}")

def main():
    audio_path = r"backend\src\Sweet Bird Sound - Morning Sound Effect  Garden Bird.mp3"
    front_image_path = r"backend\src\frontbird.jpg"
    back_image_path = r"backend\src\backbird.jpg"

    if not os.path.exists(audio_path):
        print("Audio file not found")
        return
    if not os.path.exists(front_image_path):
        print("Front image not found")
        return
    if not os.path.exists(back_image_path):
        print("Back image not found")
        return

    print("Analyzing sound...")
    sound = recognize_sound(audio_path)
    print(f"Sound identified: {sound}")

    print("\nDetecting object in images...")
    angle, detection_info = infer_sound_direction(front_image_path, back_image_path, sound)
    

    #visualize_detection(detection_info, angle)
    
    if angle < 45 or angle >= 315:
        direction = "front"
    elif 45 <= angle < 135:
        direction = "right"
    elif 135 <= angle < 225:
        direction = "back"
    else:
        direction = "left"
    
    print(f"\nApproximate direction: {direction}")
    
    motor_powers = calculate_motor_powers(angle)
    visualize_motor_powers(motor_powers, angle)


    write_json(sound, angle, motor_powers)


if __name__ == "__main__":
    main()
