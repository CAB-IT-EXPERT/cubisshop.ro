param(
    [Parameter(Mandatory = $true)]
    [string]$IconSource,

    [Parameter(Mandatory = $true)]
    [string]$LogoSource
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot

function Save-ResizedPng {
    param(
        [string]$Source,
        [string]$Target,
        [int]$Width,
        [int]$Height
    )

    $sourceImage = [System.Drawing.Image]::FromFile($Source)
    try {
        $bitmap = [System.Drawing.Bitmap]::new(
            $Width,
            $Height,
            [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
        )
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.DrawImage($sourceImage, 0, 0, $Width, $Height)
            }
            finally {
                $graphics.Dispose()
            }

            $bitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $bitmap.Dispose()
        }
    }
    finally {
        $sourceImage.Dispose()
    }
}

function Save-CroppedLogo {
    param(
        [string]$Source,
        [string]$Target
    )

    $sourceImage = [System.Drawing.Bitmap]::FromFile($Source)
    try {
        # Removes only the unused outer whitespace; the supplied artwork is not redrawn.
        $crop = [System.Drawing.Rectangle]::new(110, 260, 1034, 735)
        $croppedImage = $sourceImage.Clone(
            $crop,
            [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
        )
        try {
            $croppedImage.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $croppedImage.Dispose()
        }
    }
    finally {
        $sourceImage.Dispose()
    }
}

function Save-CroppedIcon {
    param(
        [string]$Source,
        [string]$Target
    )

    $sourceImage = [System.Drawing.Image]::FromFile($Source)
    try {
        $bitmap = [System.Drawing.Bitmap]::new(
            1024,
            1024,
            [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
        )
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $destination = [System.Drawing.Rectangle]::new(0, 0, 1024, 1024)
                $sourceCrop = [System.Drawing.Rectangle]::new(177, 177, 900, 900)
                $graphics.DrawImage(
                    $sourceImage,
                    $destination,
                    $sourceCrop,
                    [System.Drawing.GraphicsUnit]::Pixel
                )
            }
            finally {
                $graphics.Dispose()
            }

            $bitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $bitmap.Dispose()
        }
    }
    finally {
        $sourceImage.Dispose()
    }
}

function Save-PngIconContainer {
    param(
        [string]$Source,
        [string]$Target
    )

    $sourceImage = [System.Drawing.Image]::FromFile($Source)
    try {
        $bitmap = [System.Drawing.Bitmap]::new(
            256,
            256,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.DrawImage($sourceImage, 0, 0, 256, 256)
            }
            finally {
                $graphics.Dispose()
            }

            $pngStream = [System.IO.MemoryStream]::new()
            try {
                $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
                $pngBytes = $pngStream.ToArray()
                $fileStream = [System.IO.File]::Open(
                    $Target,
                    [System.IO.FileMode]::Create,
                    [System.IO.FileAccess]::Write
                )
                try {
                    $writer = [System.IO.BinaryWriter]::new($fileStream)
                    try {
                        $writer.Write([UInt16]0)
                        $writer.Write([UInt16]1)
                        $writer.Write([UInt16]1)
                        $writer.Write([Byte]0)
                        $writer.Write([Byte]0)
                        $writer.Write([Byte]0)
                        $writer.Write([Byte]0)
                        $writer.Write([UInt16]1)
                        $writer.Write([UInt16]32)
                        $writer.Write([UInt32]$pngBytes.Length)
                        $writer.Write([UInt32]22)
                        $writer.Write($pngBytes)
                    }
                    finally {
                        $writer.Dispose()
                    }
                }
                finally {
                    $fileStream.Dispose()
                }
            }
            finally {
                $pngStream.Dispose()
            }
        }
        finally {
            $bitmap.Dispose()
        }
    }
    finally {
        $sourceImage.Dispose()
    }
}

$mobileAssets = Join-Path $projectRoot 'assets\images'
$desktopAssets = Join-Path $projectRoot 'electron-app\assets'
$mobileIcon = Join-Path $mobileAssets 'cubis-shop-icon.png'
$mobileLogo = Join-Path $mobileAssets 'cubis-shop-logo.png'
$mobileMonochrome = Join-Path $mobileAssets 'cubis-shop-monochrome.png'
$desktopIcon = Join-Path $desktopAssets 'cubis-shop-icon.png'
$desktopLogo = Join-Path $desktopAssets 'cubis-shop-logo.png'
$desktopWindowsIcon = Join-Path $desktopAssets 'cubis-shop-icon.ico'

Save-CroppedIcon -Source $IconSource -Target $mobileIcon
[System.IO.File]::Copy($mobileIcon, $mobileMonochrome, $true)
[System.IO.File]::Copy($mobileIcon, $desktopIcon, $true)
Save-CroppedLogo -Source $LogoSource -Target $mobileLogo
[System.IO.File]::Copy($mobileLogo, $desktopLogo, $true)
Save-PngIconContainer -Source $mobileIcon -Target $desktopWindowsIcon

Get-Item $mobileIcon, $mobileLogo, $desktopIcon, $desktopLogo, $desktopWindowsIcon |
    Select-Object FullName, Length
