using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Text;
// ReSharper disable IdentifierTypo

namespace SpriteRotate
{
    class Program
    {
        static void Main(string[] args)
        {
            PrepareTitleScreen();
        }

        static void PrepareTitleScreen()
        {
            var bmp = new Bitmap(@"..\scubascrn.png");
            var palette = new Color[]
            {
                Color.FromArgb(0, 0, 0),
                Color.FromArgb(255, 0, 255),
                Color.FromArgb(255, 255, 0),
                Color.FromArgb(255, 0, 0),
            };

            var missingColors = new HashSet<Color>();

            var planes = new[] { new byte[8192], new byte[8192], new byte[8192] };

            for (int col = 0; col < 32; col++)
            {
                for (int row = 0; row < 256; row++)
                {
                    int b0 = 0, b1 = 0, b2 = 0;
                    for (int b = 0; b < 8; b++)
                    {
                        var color = bmp.GetPixel(col * 8 + b, 255 - row);

                        int index = -1;
                        for (int i = 0; i < 4; i++)
                        {
                            if (palette[i] == color)
                            {
                                index = i;
                                break;
                            }
                        }

                        if (index == -1)
                        {
                            if (!missingColors.Contains(color))
                            {
                                Console.WriteLine($"Color not found: Color.FromArgb({color.R}, {color.G}, {color.B})");
                                missingColors.Add(color);
                            }
                        }

                        b0 = b0 << 1;
                        b0 |= index & 1;
                        b1 = b1 << 1;
                        b1 |= (index & 2) >> 1;
                        b2 = b2 << 1;
                        b2 |= (index & 4) >> 2;
                    }

                    planes[0][col * 256 + row] = (byte)b0;
                    planes[1][col * 256 + row] = (byte)b1;
                    planes[2][col * 256 + row] = (byte)b2;
                }
            }

            const string outfilename = "scubascrn.asm";
            using (var writer = new StreamWriter(outfilename))
            {
                //writer.WriteLine("TitleScreen:");
                //WriteByteArray(planes[2], writer);
                writer.WriteLine("TitleScreen1:");
                WriteByteArray(planes[1], writer);
                writer.WriteLine("TitleScreen0:");
                WriteByteArray(planes[0], writer);
            }
            Console.WriteLine($"{outfilename} saved");

            const string binfilename = "scubascrn.bin";
            using (var stream = File.Open(binfilename, FileMode.Create))
            {
                //stream.Write(planes[2], 0, planes[2].Length);
                stream.Write(planes[1], 0, planes[1].Length);
                stream.Write(planes[0], 0, planes[0].Length);
            }
            Console.WriteLine($"{binfilename} saved");
        }

        static void WriteByteArray(byte[] octets, StreamWriter writer)
        {
            int cnt = 0;
            for (int i = 0; i < octets.Length; i++)
            {
                if (cnt == 0)
                {
                    writer.Write("  DB ");
                }
                else
                {
                    writer.Write(",");
                }

                writer.Write($"${octets[i]:X2}");

                cnt++;
                if (cnt >= 16)
                {
                    writer.WriteLine();
                    cnt = 0;
                }
            }
            if (cnt != 0)
                writer.WriteLine();
        }
    }
}
