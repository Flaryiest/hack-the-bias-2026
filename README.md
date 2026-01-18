# Hearless - AI Bluetooth Wearable

AI wearable that turns omnidirectional noise into silent haptics.

## Inspiration
We live in a world surrounded by constant noise. Cars honking, doorbells ringing, people conversing. However, for hundreds of millions of people living with some form of hearing loss, that noise is silent. Not only is this isolating and inconvenient for these people, but it can pose a massive danger to them, and we felt that these concerns were unheard.

Because of this issue, our team wanted to base our project around this concept. We noticed that there was very little technology aimed at telling the user where sounds came from, which is why we decided to create Hearless.

## What it does
Hearless is an AI-powered directional sound system that users can wear, providing real-time spatial awareness for those with hearing loss. It looks to reduce systemic bias by providing physical vibrations, allowing the user to determine where sounds come from. 

## How we built it
When designing this product, we kept a few important criteria in mind.
- The device must be able to detect and identify sounds around the user
To capture audio, we use microphones based on computer/phone audio. This information is captured and sent to OpenAI's GPT-4 Audio model, which allows us to classify different sounds.

- The device must be able to identify the source of the sound around the user
To capture real-time information around the user, we use one front and one back camera to provide directional awareness. Using the classified audio, we use a YOLOv8 computer vision model to locate potential sources of audio. After identifying the source, we can calculate the relative angle to the user based off of the image.

- The device must be able to vibrate in the direction of sound
With the relative angle, we use inverse distance weighting to calculate the power for each motor, providing more power to motors closer to the source of sound. These values are then communicated to each motor via Bluetooth, which vibrates the device in its corresponding direction.

## Challenges we ran into
One major challenge we ran into was image processing and identifying different objects in a loud or blurry picture. We initially tried to use GPT-4's vision model to draw bounding boxes for us, but we found that it was often inconsistent and wouldn't draw boxes around the object. We also found that this model would automatically resize images, which would throw off our angle calculations. To fix this, we switched to using YOLOv8, a pretrained computer vision model which classifies various different objects.

Another challenge that we faced was ensuring that the intensity of sound with consideration of its direction would proportionally increase the intensity of the motor vibrations. We solved this by using the microphone to determine the total intensity while using the camera and trigonometry to determine how to divide that total intensity intuitively.

## Accomplishments that we're proud of
We were proud of being able to integrate a full-stack software and hardware solution that could be potentially adapted into a consumer product. We truly made a special project at this hackathon. With a team composed mostly of beginner hackers, we were able to not only learn the necessary skills to create projects, but were also able to fully complete our envisioned product. A few milestones for our project include when we were able to adapt the AI Learning models to recognize objects, and later connecting it to the detected sound. We also successfully made a user friendly and simplistic UI for the optimal user experience. Our greatest success was coordinating and connecting the different skills and passions that were present within our team to create a project that we were all proud of.

## What we learned
Our team learned that there's many things that we often take for granted, that some people unfortunately don't have access to. Before this project, we never really considered how much sound pilots our daily life. We realized the lack of support for these issues, teaching us that oftentimes the most pressing issues are hidden in plain sight. Additionally, we learned how to adapt these issues to create solutions that could be applied to the real-world. 

## What's next for Hearless - AI Bluetooth Wearable
To further add onto this design, we would like to implement a feature where users could customize different vibrations to react to different sounds, which would provide a more comprehensive output to the user.

