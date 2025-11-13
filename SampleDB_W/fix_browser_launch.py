# Quick fix for browser launch issues
def fix_puppeteer_recorder():
    file_path = 'core/recording_service/puppeteer_recorder.py'
    
    # Read the current file
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Replace the browser launch section with a more reliable version
    old_launch = '''            self.browser = await launch(
                headless=False,  # Use virtual display, not headless
                args=browser_args,
                executablePath='/usr/bin/chromium-browser',
                autoClose=False,
                handleSIGINT=False,
                handleSIGTERM=False,
                handleSIGHUP=False,
                ignoreHTTPSErrors=True,
                timeout=30000  # 30 second timeout
            )'''
    
    new_launch = '''            # Try multiple browser paths
            browser_paths = [
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/usr/bin/google-chrome',
                '/snap/bin/chromium'
            ]
            
            browser_launched = False
            for browser_path in browser_paths:
                if os.path.exists(browser_path):
                    try:
                        logger.info(f"Trying browser: {browser_path}")
                        self.browser = await launch(
                            headless=True,  # Use headless with virtual display
                            args=browser_args,
                            executablePath=browser_path,
                            autoClose=False,
                            handleSIGINT=False,
                            handleSIGTERM=False,
                            handleSIGHUP=False,
                            ignoreHTTPSErrors=True,
                            timeout=15000  # 15 second timeout
                        )
                        browser_launched = True
                        logger.info(f"Browser launched successfully with: {browser_path}")
                        break
                    except Exception as e:
                        logger.warning(f"Failed to launch {browser_path}: {e}")
                        continue
            
            if not browser_launched:
                raise Exception("Could not launch any browser")'''
    
    if old_launch in content:
        content = content.replace(old_launch, new_launch)
        with open(file_path, 'w') as f:
            f.write(content)
        print("✓ Fixed browser launch code")
    else:
        print("⚠ Could not find browser launch code to replace")

if __name__ == "__main__":
    fix_puppeteer_recorder()
