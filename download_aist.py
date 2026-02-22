import os
import requests
from tqdm import tqdm

def download_file(url, filename, desc="Downloading"):
    """Download a file with progress bar"""
    response = requests.get(url, stream=True)
    response.raise_for_status()
    
    total_size = int(response.headers.get('content-length', 0))
    with open(filename, 'wb') as file, tqdm(
        desc=desc,
        total=total_size,
        unit='B',
        unit_scale=True,
        unit_divisor=1024,
    ) as pbar:
        for chunk in response.iter_content(chunk_size=8192):
            size = file.write(chunk)
            pbar.update(size)

def main():
    # Create datasets directory if it doesn't exist
    os.makedirs("datasets", exist_ok=True)
    
    print("Available AIST++ dataset types:")
    print("1. 2D keypoints (small)")
    print("2. 3D keypoints (medium)")
    print("3. Audio files (small)")
    print("4. All basic files")
    
    choice = input("\nSelect download (1-4): ").strip()
    
    base_url = "https://storage.googleapis.com/aist_plusplus_public/dataset/"
    
    if choice == "1":
        files_to_download = [
            ("2d_keypoints.zip", "2D keypoints"),
        ]
    elif choice == "2":
        files_to_download = [
            ("3d_keypoints.zip", "3D keypoints"),
        ]
    elif choice == "3":
        files_to_download = [
            ("audio.zip", "Audio files"),
        ]
    elif choice == "4":
        files_to_download = [
            ("2d_keypoints.zip", "2D keypoints"),
            ("3d_keypoints.zip", "3D keypoints"),
            ("audio.zip", "Audio files"),
        ]
    else:
        print("Invalid selection")
        return
    
    print(f"\nDownloading selected files to datasets/ directory...")
    
    for filename, description in files_to_download:
        local_path = f"datasets/{filename}"
        if os.path.exists(local_path):
            print(f"{filename} already exists, skipping...")
            continue
        
        url = base_url + filename
        print(f"\nDownloading {description}: {filename}")
        try:
            download_file(url, local_path, f"Downloading {filename}")
            print(f"Successfully downloaded {filename}")
        except Exception as e:
            print(f"Error downloading {filename}: {str(e)}")

if __name__ == "__main__":
    main()