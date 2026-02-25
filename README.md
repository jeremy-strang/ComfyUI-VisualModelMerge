# Visual Model Merge SDXL

A ComfyUI custom node that provides an interactive curve editor for SDXL model block weight merging.

![Visual Model Merge SDXL](assets/screenshot.jpg)

## Features

- Visual curve editor for controlling merge weights across 21 SDXL blocks (9 input, 3 middle, 9 output)
- Gaussian smoothing for natural curve adjustments
- Color-coded sections: Blue (IN), Orange (MID), Green (OUT)
- Additional controls for `time_embed`, `label_emb`, and `out` layer weights

## Installation

Copy this folder to your `ComfyUI/custom_nodes/` directory and restart ComfyUI.

## Usage

1. Add the **Visual Model Merge SDXL** node (found under `advanced/model_merging/visual`)
2. Connect two SDXL models to `model1` and `model2` inputs
3. Drag on the curve to adjust block weights (values 0-100, converted to 0.0-1.0 internally)

See [example/VisualModelMergeSDXL.json](example/VisualModelMergeSDXL.json) for a sample workflow.

### Controls

| Action | Effect |
|--------|--------|
| **Drag** | Adjust curve with Gaussian smoothing applied to nearby blocks |
| **Shift + Drag** | Edit only the single block under the cursor |
| **Smoothing Radius** | Controls how many neighboring blocks are affected when dragging (1 = tight, 8 = wide) |
| **Reset Weights** | Returns all 21 block weights to 100 |

### Merge Behavior

- **100** = Use model2's weights fully for that block
- **0** = Use model1's weights fully for that block
- Values in between blend proportionally
