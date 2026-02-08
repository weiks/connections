from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), (250, 250, 248, 255))
    draw = ImageDraw.Draw(img)
    
    padding = size * 0.12
    grid_size = size - padding * 2
    cell_size = grid_size / 4.3
    gap = cell_size * 0.08
    
    colors = [
        (249, 223, 109),  # yellow
        (160, 195, 90),   # green
        (176, 196, 239),  # blue
        (186, 129, 197),  # purple
    ]
    
    radius = int(cell_size * 0.18)
    
    for row in range(4):
        for col in range(4):
            color = colors[row]
            x = padding + col * (cell_size + gap)
            y = padding + row * (cell_size + gap)
            x1 = x + cell_size
            y1 = y + cell_size
            draw.rounded_rectangle([x, y, x1, y1], radius=radius, fill=color)
    
    img.save(output_path, 'PNG')

create_icon(192, 'public/icon-192.png')
create_icon(512, 'public/icon-512.png')
print("Icons created!")
