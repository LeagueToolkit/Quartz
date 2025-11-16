import dds_sys
import PIL.Image

def decode_dds(src_data, crop=None):
    img = dds_sys.decompress_with_crop(src_data, crop)
    modes = {3: 'RGB', 4: 'RGBA'}
    return PIL.Image.frombytes(modes[img.components], img.extent(), img.pixels())
