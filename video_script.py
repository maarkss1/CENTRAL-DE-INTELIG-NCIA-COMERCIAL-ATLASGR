from moviepy import ImageClip, concatenate_videoclips
import os

images = sorted([f for f in os.listdir('.') if f.endswith('.png') and f.startswith('0')])
clips = []

for img in images:
    clip = ImageClip(img).with_duration(2)
    clips.append(clip)

if clips:
    video = concatenate_videoclips(clips, method="compose")
    video.write_videofile("navigation_flow.mp4", fps=24, codec="libx264")
else:
    print("No images found.")
