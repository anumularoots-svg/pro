import os

def create_simple_recorder():
    content = '''import os
import asyncio
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from pyppeteer import launch

logger = logging.getLogger(__name__)

class PuppeteerRecorder:
    def __init__(self, meeting_id: str, user_id: str, meeting_url: str):
        self.meeting_id = meeting_id
        self.user_id = user_id  
        self.meeting_url = meeting_url
        self.browser = None
        self.page = None
        self.recording_process = None
        self.is_recording = False
        self.output_dir = f"/tmp/recordings/{meeting_id}/"
        self.video_path = None
        self.display = None
        self.display_num = None
        
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        
    async def setup_virtual_display(self):
        try:
            import random
            self.display_num = f":{random.randint(100, 199)}"
            
            self.display = subprocess.Popen([
                "Xvfb", self.display_num, 
                "-screen", "0", "1920x1080x24",
                "-ac", "+extension", "RANDR"
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            os.environ['DISPLAY'] = self.display_num
            await asyncio.sleep(2)
            logger.info(f"Virtual display {self.display_num} started")
            
        except Exception as e:
            logger.error(f"Failed to setup virtual display: {e}")
            raise

    async def launch_browser(self):
        try:
            logger.info(f"Launching browser with display {self.display_num}")
            
            # Simplified browser args
            args = [
                '--no-sandbox',
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--window-size=1920,1080',
                '--ignore-certificate-errors',
                '--disable-web-security',
                '--no-first-run'
            ]
            
            # Try system chromium first
            browser_path = None
            for path in ['/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/google-chrome']:
                if os.path.exists(path):
                    browser_path = path
                    break
            
            if browser_path:
                logger.info(f"Using browser: {browser_path}")
                self.browser = await launch(
                    headless=True,
                    args=args,
                    executablePath=browser_path,
                    timeout=10000
                )
            else:
                # Fall back to pyppeteer default
                logger.info("Using pyppeteer default browser")
                self.browser = await launch(headless=True, args=args, timeout=10000)
            
            self.page = await self.browser.newPage()
            await self.page.setViewport({'width': 1920, 'height': 1080})
            
            logger.info("Browser launched successfully")
            
        except Exception as e:
            logger.error(f"Failed to launch browser: {e}")
            await self.cleanup()
            raise

    async def join_meeting(self, bot_name: str = "Recording Bot"):
        try:
            logger.info(f"Navigating to: {self.meeting_url}")
            await self.page.goto(self.meeting_url, {'waitUntil': 'networkidle2', 'timeout': 20000})
            await asyncio.sleep(3)
            logger.info("Successfully navigated to meeting")
        except Exception as e:
            logger.error(f"Failed to join meeting: {e}")
            raise

    async def start_recording(self):
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            self.video_path = os.path.join(self.output_dir, f"meeting_{self.meeting_id}_{timestamp}.mp4")
            
            cmd = [
                'ffmpeg', '-y', '-f', 'x11grab', '-video_size', '1920x1080',
                '-framerate', '10', '-i', self.display_num,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                '-t', '30', self.video_path
            ]
            
            logger.info(f"Starting recording: {self.video_path}")
            self.recording_process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.is_recording = True
            
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            raise

    async def stop_recording(self):
        try:
            if not self.is_recording or not self.recording_process:
                return None
                
            self.recording_process.terminate()
            try:
                self.recording_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.recording_process.kill()
                
            self.is_recording = False
            
            if os.path.exists(self.video_path) and os.path.getsize(self.video_path) > 0:
                logger.info(f"Recording completed: {self.video_path}")
                return self.video_path
            return None
            
        except Exception as e:
            logger.error(f"Failed to stop recording: {e}")
            return None

    async def cleanup(self):
        try:
            if self.is_recording:
                await self.stop_recording()
            if self.page:
                await self.page.close()
            if self.browser:
                await self.browser.close()
            if self.display:
                self.display.terminate()
                try:
                    self.display.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.display.kill()
            logger.info("Cleanup completed")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

    async def record_meeting(self, duration_minutes=None):
        try:
            await self.setup_virtual_display()
            await self.launch_browser()
            await self.join_meeting()
            await self.start_recording()
            
            if duration_minutes:
                await asyncio.sleep(duration_minutes * 60)
                return await self.stop_recording()
            else:
                while self.is_recording:
                    await asyncio.sleep(5)
                return self.video_path
                
        except Exception as e:
            logger.error(f"Recording failed: {e}")
            raise
        finally:
            await self.cleanup()
'''
    
    with open('core/recording_service/puppeteer_recorder.py', 'w') as f:
        f.write(content)
    print("Created simplified recorder")

if __name__ == "__main__":
    create_simple_recorder()
