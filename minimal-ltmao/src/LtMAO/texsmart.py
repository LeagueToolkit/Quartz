import os.path
from PIL import Image
from . import lepath, tools, Ritoddstex

def dds2png(src):
    tools.ImageMagick.to_png(
        src=src,
        png=lepath.ext(src, '.dds', '.png')
    )

def png2dds(src, dst=None, format='dxt5', mipmap=False):
    """Native PNG to DDS conversion using PIL and pydds"""
    if dst is None:
        dst = lepath.ext(src, '.png', '.dds')
    
    print(f'Native: Converting PNG to DDS: {src} -> {dst}')
    
    # Read PNG with PIL (native)
    with Image.open(src) as img:
        # Ensure RGBA mode
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Try using pydds for encoding (native)
        try:
            from pydds import encode_dds
            import numpy as np
            # Convert PIL image to numpy array for pydds
            img_array = np.array(img)
            
            # Encode to DDS
            dds_data = encode_dds(img_array, format=format.upper(), mipmap=mipmap)
            
            # Write DDS file
            with open(dst, 'wb') as dds_file:
                dds_file.write(dds_data)
            
            print(f'Native: Successfully converted to DDS using pydds: {dst}')
            return
        except ImportError:
            raise ImportError('pydds library is required for PNG to DDS conversion. Please install it.')
        except Exception as e:
            print(f'Native: pydds encoding failed: {e}')
            raise e

def dds2tex(src):
    Ritoddstex.dds2tex(src)

def tex2dds(src):
    Ritoddstex.tex2dds(src)

def make2x4x(src):
    with Image.open(src) as img:
        basename = os.path.basename(src)
        dirname = os.path.dirname(src)
        width_2x = img.width // 2
        height_2x = img.height // 2
        file_2x = lepath.join(dirname, '2x_'+basename)
        width_4x = img.width // 4
        height_4x = img.height // 4
        file_4x = lepath.join(dirname, '4x_'+basename)
    if not os.path.exists(file_2x):
        tools.ImageMagick.resize_dds(
            src=src,
            dst=file_2x, width=width_2x, height=height_2x
        )
    if not os.path.exists(file_4x):
        tools.ImageMagick.resize_dds(
            src=src,
            dst=file_4x, width=width_4x, height=height_4x
        )