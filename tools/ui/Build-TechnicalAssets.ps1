param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
$drawingAssemblyPath = [System.Drawing.Bitmap].Assembly.Location
$drawingPrimitivesAssemblyPath = [System.Drawing.Rectangle].Assembly.Location
$gdiPlusAssemblyPath = Join-Path (Split-Path $drawingAssemblyPath) 'System.Private.Windows.GdiPlus.dll'
$windowsCoreAssemblyPath = Join-Path (Split-Path $drawingAssemblyPath) 'System.Private.Windows.Core.dll'

if (-not ('SpynonTechnicalAssetBuilder' -as [type])) {
    Add-Type -ReferencedAssemblies $drawingAssemblyPath, $drawingPrimitivesAssemblyPath, $gdiPlusAssemblyPath, $windowsCoreAssemblyPath -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public sealed class SpynonAssetBuildResult
{
    public string Id { get; set; }
    public int PrimaryPixels { get; set; }
    public int SignaturePixels { get; set; }
    public int ShelfPixels { get; set; }
}

public static class SpynonTechnicalAssetBuilder
{
    private static double Clamp01(double value)
    {
        return Math.Max(0.0, Math.Min(1.0, value));
    }

    private static void ToHsv(byte red, byte green, byte blue, out double hue, out double saturation, out double value)
    {
        double r = red / 255.0;
        double g = green / 255.0;
        double b = blue / 255.0;
        double max = Math.Max(r, Math.Max(g, b));
        double min = Math.Min(r, Math.Min(g, b));
        double delta = max - min;

        value = max;
        saturation = max <= 0.0 ? 0.0 : delta / max;

        if (delta <= 0.00001)
        {
            hue = 0.0;
        }
        else if (max == r)
        {
            hue = 60.0 * (((g - b) / delta) % 6.0);
        }
        else if (max == g)
        {
            hue = 60.0 * (((b - r) / delta) + 2.0);
        }
        else
        {
            hue = 60.0 * (((r - g) / delta) + 4.0);
        }

        if (hue < 0.0)
        {
            hue += 360.0;
        }
    }

    private static Bitmap CreateBitmap(int width, int height, byte[] bytes, int stride)
    {
        Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        Rectangle rectangle = new Rectangle(0, 0, width, height);
        BitmapData data = bitmap.LockBits(rectangle, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try
        {
            for (int y = 0; y < height; y++)
            {
                IntPtr destination = IntPtr.Add(data.Scan0, y * data.Stride);
                Marshal.Copy(bytes, y * stride, destination, width * 4);
            }
        }
        finally
        {
            bitmap.UnlockBits(data);
        }

        return bitmap;
    }

    private static void SavePng(string path, int width, int height, byte[] bytes, int stride)
    {
        using (Bitmap bitmap = CreateBitmap(width, height, bytes, stride))
        {
            bitmap.Save(path, ImageFormat.Png);
        }
    }

    private static void SaveTga(string path, int width, int height, byte[] bytes, int stride)
    {
        using (FileStream stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None))
        using (BinaryWriter writer = new BinaryWriter(stream))
        {
            writer.Write((byte)0);
            writer.Write((byte)0);
            writer.Write((byte)2);
            writer.Write((short)0);
            writer.Write((short)0);
            writer.Write((byte)0);
            writer.Write((short)0);
            writer.Write((short)0);
            writer.Write((short)width);
            writer.Write((short)height);
            writer.Write((byte)32);
            writer.Write((byte)0x28);

            for (int y = 0; y < height; y++)
            {
                writer.Write(bytes, y * stride, width * 4);
            }
        }
    }

    private static byte[] BlankMask(int width, int height, int stride)
    {
        byte[] mask = new byte[stride * height];
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int offset = y * stride + x * 4;
                mask[offset] = 255;
                mask[offset + 1] = 255;
                mask[offset + 2] = 255;
                mask[offset + 3] = 0;
            }
        }
        return mask;
    }

    public static SpynonAssetBuildResult Build(
        string id,
        string sourcePath,
        string pngDirectory,
        string tgaDirectory,
        int canvasWidth,
        int canvasHeight,
        int contentX,
        int contentY,
        int contentWidth,
        int contentHeight,
        bool hasShelf,
        int shelfSourceX,
        int shelfSourceY,
        int shelfSourceWidth,
        int shelfSourceHeight)
    {
        using (Bitmap source = new Bitmap(sourcePath))
        using (Bitmap canvas = new Bitmap(canvasWidth, canvasHeight, PixelFormat.Format32bppArgb))
        {
            using (Graphics graphics = Graphics.FromImage(canvas))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.DrawImage(source, new Rectangle(contentX, contentY, contentWidth, contentHeight));
            }

            Rectangle rectangle = new Rectangle(0, 0, canvasWidth, canvasHeight);
            BitmapData data = canvas.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int stride = canvasWidth * 4;
            byte[] resized = new byte[stride * canvasHeight];
            try
            {
                for (int y = 0; y < canvasHeight; y++)
                {
                    IntPtr sourceRow = IntPtr.Add(data.Scan0, y * data.Stride);
                    Marshal.Copy(sourceRow, resized, y * stride, stride);
                }
            }
            finally
            {
                canvas.UnlockBits(data);
            }

            byte[] neutral = (byte[])resized.Clone();
            byte[] primary = BlankMask(canvasWidth, canvasHeight, stride);
            byte[] signature = BlankMask(canvasWidth, canvasHeight, stride);
            byte[] shelf = BlankMask(canvasWidth, canvasHeight, stride);
            int primaryPixels = 0;
            int signaturePixels = 0;

            for (int y = 0; y < canvasHeight; y++)
            {
                for (int x = 0; x < canvasWidth; x++)
                {
                    int offset = y * stride + x * 4;
                    byte blue = resized[offset];
                    byte green = resized[offset + 1];
                    byte red = resized[offset + 2];
                    byte alpha = resized[offset + 3];
                    if (alpha == 0)
                    {
                        continue;
                    }

                    double hue;
                    double saturation;
                    double value;
                    ToHsv(red, green, blue, out hue, out saturation, out value);

                    bool isPrimary = hue >= 175.0 && hue <= 245.0 && saturation >= 0.38 && value >= 0.16;
                    bool isSignature = hue >= 70.0 && hue <= 165.0 && saturation >= 0.40 && value >= 0.16;
                    if (!isPrimary && !isSignature)
                    {
                        continue;
                    }

                    double saturationScore = Clamp01((saturation - 0.25) / 0.55);
                    double valueScore = Clamp01((value - 0.10) / 0.50);
                    double maskStrength = Clamp01(0.35 + 0.65 * saturationScore * valueScore);
                    byte maskAlpha = (byte)Math.Round(alpha * maskStrength);

                    if (isPrimary)
                    {
                        primary[offset + 3] = maskAlpha;
                        primaryPixels++;
                    }
                    else
                    {
                        signature[offset + 3] = maskAlpha;
                        signaturePixels++;
                    }

                    double luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
                    double neutralBlend = Clamp01(0.72 + 0.28 * saturationScore);
                    byte targetRed = (byte)Math.Min(255.0, 7.0 + luminance * 0.14);
                    byte targetGreen = (byte)Math.Min(255.0, 19.0 + luminance * 0.14);
                    byte targetBlue = (byte)Math.Min(255.0, 29.0 + luminance * 0.14);

                    neutral[offset] = (byte)Math.Round(blue * (1.0 - neutralBlend) + targetBlue * neutralBlend);
                    neutral[offset + 1] = (byte)Math.Round(green * (1.0 - neutralBlend) + targetGreen * neutralBlend);
                    neutral[offset + 2] = (byte)Math.Round(red * (1.0 - neutralBlend) + targetRed * neutralBlend);
                }
            }

            int shelfPixels = 0;
            if (hasShelf)
            {
                double scaleX = contentWidth / (double)source.Width;
                double scaleY = contentHeight / (double)source.Height;
                int shelfX = contentX + (int)Math.Round(shelfSourceX * scaleX);
                int shelfY = contentY + (int)Math.Round(shelfSourceY * scaleY);
                int shelfWidth = Math.Max(1, (int)Math.Round(shelfSourceWidth * scaleX));
                int shelfHeight = Math.Max(1, (int)Math.Round(shelfSourceHeight * scaleY));
                int cornerRadius = Math.Max(1, shelfHeight / 4);

                for (int y = shelfY; y < Math.Min(canvasHeight, shelfY + shelfHeight); y++)
                {
                    for (int x = shelfX; x < Math.Min(canvasWidth, shelfX + shelfWidth); x++)
                    {
                        int localX = x - shelfX;
                        int localY = y - shelfY;
                        bool inside = true;
                        if (localX < cornerRadius && localY < cornerRadius)
                        {
                            int dx = cornerRadius - localX;
                            int dy = cornerRadius - localY;
                            inside = dx * dx + dy * dy <= cornerRadius * cornerRadius;
                        }
                        else if (localX >= shelfWidth - cornerRadius && localY < cornerRadius)
                        {
                            int dx = localX - (shelfWidth - cornerRadius - 1);
                            int dy = cornerRadius - localY;
                            inside = dx * dx + dy * dy <= cornerRadius * cornerRadius;
                        }
                        else if (localX < cornerRadius && localY >= shelfHeight - cornerRadius)
                        {
                            int dx = cornerRadius - localX;
                            int dy = localY - (shelfHeight - cornerRadius - 1);
                            inside = dx * dx + dy * dy <= cornerRadius * cornerRadius;
                        }
                        else if (localX >= shelfWidth - cornerRadius && localY >= shelfHeight - cornerRadius)
                        {
                            int dx = localX - (shelfWidth - cornerRadius - 1);
                            int dy = localY - (shelfHeight - cornerRadius - 1);
                            inside = dx * dx + dy * dy <= cornerRadius * cornerRadius;
                        }

                        if (inside)
                        {
                            int offset = y * stride + x * 4;
                            shelf[offset + 3] = 255;
                            shelfPixels++;
                        }
                    }
                }
            }

            string neutralName = id + "-neutral-v1";
            string primaryName = id + "-primary-mask-v1";
            string signatureName = id + "-signature-mask-v1";
            SavePng(Path.Combine(pngDirectory, neutralName + ".png"), canvasWidth, canvasHeight, neutral, stride);
            SavePng(Path.Combine(pngDirectory, primaryName + ".png"), canvasWidth, canvasHeight, primary, stride);
            SavePng(Path.Combine(pngDirectory, signatureName + ".png"), canvasWidth, canvasHeight, signature, stride);
            SaveTga(Path.Combine(tgaDirectory, neutralName + ".tga"), canvasWidth, canvasHeight, neutral, stride);
            SaveTga(Path.Combine(tgaDirectory, primaryName + ".tga"), canvasWidth, canvasHeight, primary, stride);
            SaveTga(Path.Combine(tgaDirectory, signatureName + ".tga"), canvasWidth, canvasHeight, signature, stride);

            if (hasShelf)
            {
                string shelfName = id + "-state-shelf-mask-v1";
                SavePng(Path.Combine(pngDirectory, shelfName + ".png"), canvasWidth, canvasHeight, shelf, stride);
                SaveTga(Path.Combine(tgaDirectory, shelfName + ".tga"), canvasWidth, canvasHeight, shelf, stride);
            }

            return new SpynonAssetBuildResult
            {
                Id = id,
                PrimaryPixels = primaryPixels,
                SignaturePixels = signaturePixels,
                ShelfPixels = shelfPixels
            };
        }
    }
}
'@
}

$sourceDirectory = Join-Path $RepositoryRoot 'assets\ui\runtime-source'
$runtimeDirectory = Join-Path $RepositoryRoot 'assets\ui\runtime'
New-Item -ItemType Directory -Path $sourceDirectory, $runtimeDirectory -Force | Out-Null

$specifications = @(
    @{
        Id = 'action-current'
        Source = 'assets\ui\frames\action-current-frame-v5.png'
        Canvas = @(512, 256)
        Content = @(56, 8, 400, 240)
        Shelf = $null
    },
    @{
        Id = 'action-queue'
        Source = 'assets\ui\frames\action-queue-frame-v4.png'
        Canvas = @(256, 256)
        Content = @(8, 8, 240, 240)
        Shelf = $null
    },
    @{
        Id = 'combat-context'
        Source = 'assets\ui\context\combat-context-card-frame-v1.png'
        Canvas = @(256, 128)
        Content = @(32, 3, 192, 122)
        Shelf = $null
    },
    @{
        Id = 'cast-indicator'
        Source = 'assets\ui\cast\cast-indicator-frame-v1.png'
        Canvas = @(1024, 256)
        Content = @(16, 38, 992, 180)
        Shelf = $null
    },
    @{
        Id = 'aura-juggle-cell'
        Source = 'assets\ui\auras\aura-juggle-cell-frame-v1.png'
        Canvas = @(512, 256)
        Content = @(1, 48, 510, 160)
        Shelf = @(810, 525, 450, 71)
    }
)

foreach ($specification in $specifications) {
    $sourcePath = Join-Path $RepositoryRoot $specification.Source
    $hasShelf = $null -ne $specification.Shelf
    $shelf = if ($hasShelf) { $specification.Shelf } else { @(0, 0, 0, 0) }
    $result = [SpynonTechnicalAssetBuilder]::Build(
        $specification.Id,
        $sourcePath,
        $sourceDirectory,
        $runtimeDirectory,
        $specification.Canvas[0],
        $specification.Canvas[1],
        $specification.Content[0],
        $specification.Content[1],
        $specification.Content[2],
        $specification.Content[3],
        $hasShelf,
        $shelf[0],
        $shelf[1],
        $shelf[2],
        $shelf[3]
    )

    Write-Output ("{0}: primary={1}; signature={2}; shelf={3}" -f $result.Id, $result.PrimaryPixels, $result.SignaturePixels, $result.ShelfPixels)
}
