import json


class VisualModelMergeSDXL:
    """
    Visual SDXL model merge node with interactive curve editor.
    Allows per-block weight control for input, middle, and output blocks.
    """

    CATEGORY = "advanced/model_merging/visual"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model1": ("MODEL",),
                "model2": ("MODEL",),
                "time_embed": (
                    "INT",
                    {"default": 100, "min": 0, "max": 100, "step": 1},
                ),
                "label_emb": (
                    "INT",
                    {"default": 100, "min": 0, "max": 100, "step": 1},
                ),
                "out": (
                    "INT",
                    {"default": 100, "min": 0, "max": 100, "step": 1},
                ),
            },
            "optional": {
                "weights_json": (
                    "STRING",
                    {
                        "default": "[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]",
                        "multiline": False,
                    },
                ),
            },
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "merge"

    def merge(
        self,
        model1,
        model2,
        time_embed,
        label_emb,
        out,
        weights_json="[100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100]",
    ):
        # Parse weights from JSON (integers 0-100)
        try:
            weights = json.loads(weights_json)
        except (json.JSONDecodeError, TypeError):
            weights = [100] * 21

        # Build kwargs dict for merge operation
        # All values are divided by 100 to convert 0-100 to 0.0-1.0
        kwargs = {}
        kwargs["time_embed."] = time_embed / 100.0
        kwargs["label_emb."] = label_emb / 100.0

        # Input blocks 0-8 (indices 0-8 in weights array)
        for i in range(9):
            kwargs[f"input_blocks.{i}"] = weights[i] / 100.0

        # Middle blocks 0-2 (indices 9-11 in weights array)
        for i in range(3):
            kwargs[f"middle_block.{i}"] = weights[9 + i] / 100.0

        # Output blocks 0-8 (indices 12-20 in weights array)
        for i in range(9):
            kwargs[f"output_blocks.{i}"] = weights[12 + i] / 100.0

        kwargs["out."] = out / 100.0

        # Clone model1 and apply patches from model2
        m = model1.clone()
        kp = model2.get_key_patches("diffusion_model.")
        default_ratio = 1.0

        for k in kp:
            ratio = default_ratio
            k_unet = k[len("diffusion_model.") :]

            # Find the most specific matching prefix
            last_arg_size = 0
            for arg in kwargs:
                if k_unet.startswith(arg) and last_arg_size < len(arg):
                    ratio = kwargs[arg]
                    last_arg_size = len(arg)

            m.add_patches({k: kp[k]}, 1.0 - ratio, ratio)

        return (m,)


NODE_CLASS_MAPPINGS = {
    "VisualModelMergeSDXL": VisualModelMergeSDXL,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VisualModelMergeSDXL": "Visual Model Merge SDXL",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
