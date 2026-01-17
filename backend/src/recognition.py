import os
import base64
import json
from dotenv import load_dotenv
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO
import cv2
import numpy as np

load_dotenv()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

yolo_model = YOLO('yolov8n.pt') 

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


def calculate_angle_from_bbox(bbox_center_x: float, image_width: float, camera_fov: float = 80, camera_angle: float = 0) -> float:
    normalized_x = (bbox_center_x / image_width) - 0.5
    angle_offset = normalized_x * camera_fov
    
    absolute_angle = (camera_angle + angle_offset) % 360
    
    return absolute_angle


def match_sound_to_yolo_class(sound_description: str, yolo_classes: list) -> list:
    sound_lower = sound_description.lower()

    sound_to_yolo = {
        'bird': ['bird'],
        'dog': ['dog'],
        'cat': ['cat'],
        'car': ['car', 'truck', 'bus'],
        'truck': ['truck'],
        'motorcycle': ['motorcycle'],
        'bicycle': ['bicycle'],
        'person': ['person'],
        'horse': ['horse'],
        'cow': ['cow'],
        'sheep': ['sheep'],
        'airplane': ['airplane'],
        'train': ['train'],
        'boat': ['boat'],
        'phone': ['cell phone'],
        'laptop': ['laptop'],
        'tv': ['tv'],
        'clock': ['clock'],
    }
    

    matches = []
    for key, yolo_names in sound_to_yolo.items():
        if key in sound_lower:
            matches.extend(yolo_names)
    

    if not matches:
        matches = ['person', 'car', 'dog', 'cat', 'bird']
    
    return matches


def detect_objects_yolo(image_path: str, sound_description: str, camera_name: str = "front") -> dict:
    img = cv2.imread(image_path)
    if img is None:
        return {
            "camera": "none",
            "bbox": [0, 0, 0, 0],
            "image_dimensions": [0, 0],
            "confidence": "low",
            "object_description": "Failed to load image"
        }
    
    height, width = img.shape[:2]

    results = yolo_model(image_path, verbose=False)

    yolo_classes = results[0].names
    

    target_classes = match_sound_to_yolo_class(sound_description, list(yolo_classes.values()))
    
    print(f"Looking for: {target_classes} based on sound: '{sound_description}'")
    

    best_detection = None
    best_confidence = 0
    
    for box in results[0].boxes:
        class_id = int(box.cls[0])
        class_name = yolo_classes[class_id]
        confidence = float(box.conf[0])
        bbox_coords = box.xyxy[0].cpu().numpy()  

        if class_name in target_classes and confidence > best_confidence:
            best_confidence = confidence
            best_detection = {
                "class": class_name,
                "confidence": confidence,
                "bbox": [int(bbox_coords[0]), int(bbox_coords[1]), 
                        int(bbox_coords[2]), int(bbox_coords[3])]
            }
    
    if best_detection is None and len(results[0].boxes) > 0:
        box = results[0].boxes[0]  
        class_id = int(box.cls[0])
        class_name = yolo_classes[class_id]
        confidence = float(box.conf[0])
        bbox_coords = box.xyxy[0].cpu().numpy()
        
        best_detection = {
            "class": class_name,
            "confidence": confidence,
            "bbox": [int(bbox_coords[0]), int(bbox_coords[1]), 
                    int(bbox_coords[2]), int(bbox_coords[3])]
        }
        print(f"⚠️  No exact match found, using highest confidence detection: {class_name}")
    
    if best_detection is None:
        return {
            "camera": "none",
            "bbox": [0, 0, 0, 0],
            "image_dimensions": [width, height],
            "confidence": "low",
            "object_description": "No objects detected"
        }
    
    conf_level = "high" if best_detection["confidence"] > 0.7 else "medium" if best_detection["confidence"] > 0.4 else "low"
    
    return {
        "camera": camera_name,
        "bbox": best_detection["bbox"],
        "image_dimensions": [width, height],
        "confidence": conf_level,
        "object_description": f"{best_detection['class']} ({best_detection['confidence']:.2f})",
        "yolo_confidence": best_detection["confidence"],
        "yolo_class": best_detection["class"]
    }


def infer_sound_direction(front_image_path: str, back_image_path: str, sound_description: str) -> tuple[float, dict]:

    print("\nRunning YOLOv8 on front camera...")
    front_detection = detect_objects_yolo(front_image_path, sound_description, "front")
    
    print("Running YOLOv8 on back camera...")
    back_detection = detect_objects_yolo(back_image_path, sound_description, "back")

    if front_detection["camera"] == "none" and back_detection["camera"] == "none":
        print("No objects detected in either camera")
        return 0.0, front_detection
    
    if front_detection["camera"] == "none":
        chosen_detection = back_detection
    elif back_detection["camera"] == "none":
        chosen_detection = front_detection
    else:
        # Both detected something, choose higher confidence
        front_conf = front_detection.get("yolo_confidence", 0)
        back_conf = back_detection.get("yolo_confidence", 0)
        chosen_detection = front_detection if front_conf >= back_conf else back_detection
    
    print(f"Selected {chosen_detection['camera']} camera detection: {chosen_detection['object_description']}")
    
    # Calculate angle from bounding box
    bbox = chosen_detection["bbox"]
    img_width = chosen_detection["image_dimensions"][0]
    bbox_center_x = (bbox[0] + bbox[2]) / 2
    
    camera_base_angle = 0 if chosen_detection["camera"] == "front" else 180
    angle = calculate_angle_from_bbox(bbox_center_x, img_width, camera_fov=80, camera_angle=camera_base_angle)
    
    return angle, chosen_detection


def draw_bounding_box(image_path: str, bbox: list, angle: float, sound: str, detection_info: dict, output_path: str = None):

    img = Image.open(image_path)
    draw = ImageDraw.Draw(img)
    
    print(f"\nImage size: {img.width}x{img.height}")
    print(f"Bounding box: {bbox}")
    
    x_min, y_min, x_max, y_max = bbox
    

    x_min = max(0, min(x_min, img.width))
    y_min = max(0, min(y_min, img.height))
    x_max = max(0, min(x_max, img.width))
    y_max = max(0, min(y_max, img.height))
    
    if x_min >= x_max or y_min >= y_max:
        print("⚠️  Warning: Invalid bounding box coordinates!")
        return None

    box_color = (0, 255, 0)
    box_width = max(5, int(img.width / 300))
    draw.rectangle([x_min, y_min, x_max, y_max], outline=box_color, width=box_width)

    center_x = (x_min + x_max) / 2
    center_y = (y_min + y_max) / 2
    circle_radius = max(10, int(img.width / 200))
    draw.ellipse(
        [center_x - circle_radius, center_y - circle_radius, 
         center_x + circle_radius, center_y + circle_radius],
        fill=(255, 0, 0)
    )
    

    yolo_class = detection_info.get("yolo_class", "unknown")
    yolo_conf = detection_info.get("yolo_confidence", 0)
    label = f"{yolo_class} ({yolo_conf:.2f}) | {sound} | {angle:.1f}°"
    

    try:
        font_size = max(30, int(img.width / 40))
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()
    

    text_bbox = draw.textbbox((0, 0), label, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    text_x = x_min
    text_y = y_min - text_height - 15
    if text_y < 0:
        text_y = y_min + 15
    

    padding = 10
    draw.rectangle(
        [text_x - padding, text_y - padding, 
         text_x + text_width + padding, text_y + text_height + padding],
        fill=(0, 0, 0)
    )
    draw.text((text_x, text_y), label, fill=(0, 255, 0), font=font)
    
    if output_path is None:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_annotated{ext}"
    
    img.save(output_path, quality=95)
    print(f"Annotated image saved to: {output_path}")
    
    return output_path


def calculate_motor_powers(angle: float, motor_positions: list = [60, 180, 300]) -> dict:
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
    print("\nMOTOR CONTROL OUTPUTS")
    print(f"Target Angle: {angle:.1f}°\n")
    
    for motor_name, power in motor_powers.items():
        motor_angle = motor_name.split('_')[1]
        bar_length = int(power * 20)
        bar = "█" * bar_length + "░" * (20 - bar_length)
        print(f"{motor_name:12} ({motor_angle:>3}°): [{bar}] {power:.3f}")

    total = sum(motor_powers.values())
    print(f"\nTotal Power: {total:.3f} (should be ~1.0)")
    print("="*50)


def write_json(sound: str, angle: float, motor_powers: dict, detection_info: dict, annotated_image_path: str = None, path: str = "output.json"):
    output_json = {
        "sound": sound, 
        "angle": round(angle, 2),
        "detection": {
            "yolo_class": detection_info.get("yolo_class", "unknown"),
            "confidence": detection_info.get("yolo_confidence", 0),
            "camera": detection_info.get("camera", "none"),
            "bbox": detection_info.get("bbox", [0, 0, 0, 0])
        },
        "motor_powers": {
            "motor_60": motor_powers.get("motor_60"),
            "motor_180": motor_powers.get("motor_180"),
            "motor_300": motor_powers.get("motor_300")
        }
    }
    
    if annotated_image_path:
        output_json["annotated_image"] = annotated_image_path

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(output_json, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Results saved to {path}")


def main():
    audio_path = r"backend\src\Sweet Bird Sound - Morning Sound Effect  Garden Bird.mp3"
    front_image_path = r"backend\src\frontbird3.webp"
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

    print("\nDetecting objects with YOLOv8...")
    angle, detection_info = infer_sound_direction(front_image_path, back_image_path, sound)
    
    if angle < 45 or angle >= 315:
        direction = "front"
    elif 45 <= angle < 135:
        direction = "right"
    elif 135 <= angle < 225:
        direction = "back"
    else:
        direction = "left"
    
    print(f"\nApproximate direction: {direction}")
    print(f"Precise angle: {angle:.1f}°")
    
    motor_powers = calculate_motor_powers(angle)
    visualize_motor_powers(motor_powers, angle)
    
    # Draw bounding box
    annotated_image_path = None
    if detection_info.get("camera") != "none":
        if detection_info["camera"] == "front":
            image_to_annotate = front_image_path
        else:
            image_to_annotate = back_image_path
        
        print(f"\nDrawing bounding box on {detection_info['camera']} camera image...")
        annotated_image_path = draw_bounding_box(
            image_path=image_to_annotate,
            bbox=detection_info["bbox"],
            angle=angle,
            sound=sound,
            detection_info=detection_info
        )
    
    write_json(sound, angle, motor_powers, detection_info, annotated_image_path)


if __name__ == "__main__":
    main()