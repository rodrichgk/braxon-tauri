using System.Collections.Generic;
using System.Drawing;

namespace ElectronikSistem;

public class BARCODE
{
	protected class CODE_EAN13
	{
		private Dictionary<char, string> Code0 = new Dictionary<char, string>();

		private Dictionary<char, string> Code1 = new Dictionary<char, string>();

		private Dictionary<char, string> Code2 = new Dictionary<char, string>();

		private Dictionary<char, string> Code3 = new Dictionary<char, string>();

		private Dictionary<char, string> Code4 = new Dictionary<char, string>();

		private Dictionary<char, string> Code5 = new Dictionary<char, string>();

		private Dictionary<char, string> Code6 = new Dictionary<char, string>();

		private Dictionary<char, string> Code7 = new Dictionary<char, string>();

		private Dictionary<char, string> Code8 = new Dictionary<char, string>();

		private Dictionary<char, string> Code9 = new Dictionary<char, string>();

		private Dictionary<char, string> CodeS = new Dictionary<char, string>();

		private Dictionary<char, string> CodeM = new Dictionary<char, string>();

		private Dictionary<char, string> CodeE = new Dictionary<char, string>();

		public Dictionary<char, Dictionary<char, string>> Codes = new Dictionary<char, Dictionary<char, string>>();

		public Dictionary<char, string> Sequence = new Dictionary<char, string>();

		public CODE_EAN13()
		{
			Code0.Add('A', "0001101");
			Code0.Add('B', "0100111");
			Code0.Add('C', "1110010");
			Code1.Add('A', "0011001");
			Code1.Add('B', "0110011");
			Code1.Add('C', "1100110");
			Code2.Add('A', "0010011");
			Code2.Add('B', "0011011");
			Code2.Add('C', "1101100");
			Code3.Add('A', "0111101");
			Code3.Add('B', "0100001");
			Code3.Add('C', "1000010");
			Code4.Add('A', "0100011");
			Code4.Add('B', "0011101");
			Code4.Add('C', "1011100");
			Code5.Add('A', "0110001");
			Code5.Add('B', "0111001");
			Code5.Add('C', "1001110");
			Code6.Add('A', "0101111");
			Code6.Add('B', "0000101");
			Code6.Add('C', "1010000");
			Code7.Add('A', "0111011");
			Code7.Add('B', "0010001");
			Code7.Add('C', "1000100");
			Code8.Add('A', "0110111");
			Code8.Add('B', "0001001");
			Code8.Add('C', "1001000");
			Code9.Add('A', "0001011");
			Code9.Add('B', "0010111");
			Code9.Add('C', "1110100");
			CodeS.Add('S', "101");
			CodeM.Add('M', "01010");
			CodeE.Add('E', "101");
			Codes.Add('0', Code0);
			Codes.Add('1', Code1);
			Codes.Add('2', Code2);
			Codes.Add('3', Code3);
			Codes.Add('4', Code4);
			Codes.Add('5', Code5);
			Codes.Add('6', Code6);
			Codes.Add('7', Code7);
			Codes.Add('8', Code8);
			Codes.Add('9', Code9);
			Codes.Add('S', CodeS);
			Codes.Add('M', CodeM);
			Codes.Add('E', CodeE);
			Sequence.Add('0', "AAAAAACCCCCC");
			Sequence.Add('1', "AABABBCCCCCC");
			Sequence.Add('2', "AABBABCCCCCC");
			Sequence.Add('3', "AABBBACCCCCC");
			Sequence.Add('4', "ABAABBCCCCCC");
			Sequence.Add('5', "ABBAABCCCCCC");
			Sequence.Add('6', "ABBBAACCCCCC");
			Sequence.Add('7', "ABABABCCCCCC");
			Sequence.Add('8', "ABABBACCCCCC");
			Sequence.Add('9', "ABBABACCCCCC");
		}
	}

	private CODE_EAN13 BarCode;

	public BARCODE()
	{
		BarCode = new CODE_EAN13();
	}

	public Bitmap CreaBarCode(string Code)
	{
		int num = 0;
		string text = "00000000000";
		string text2 = "S" + BarCode.Sequence[Code[0]].Substring(0, 6) + "M" + BarCode.Sequence[Code[0]].Substring(6) + "E";
		string text3 = "S" + Code.Substring(1, 6) + "M" + Code.Substring(7) + "E";
		string text4 = text2;
		foreach (char key in text4)
		{
			text += BarCode.Codes[text3[num++]][key];
		}
		text += "0000000";
		num = 0;
		float num2 = 0f;
		float num3 = 5.5f;
		float num4 = 7f;
		Font font = new Font(FontFamily.GenericSansSerif, num4 * num3);
		Bitmap bitmap = new Bitmap((int)((float)text.Length * num3), (int)(75.0 * (double)num3));
		Graphics graphics = Graphics.FromImage(bitmap);
		graphics.FillRectangle(Brushes.White, 0, 0, bitmap.Width, bitmap.Height);
		string text5 = text;
		foreach (char c in text5)
		{
			Brush brush = ((c != '1') ? Brushes.White : Brushes.Black);
			float num5 = (((num < 11 || num > 13) && (!((float)num >= 56f) || !((float)num <= 60f)) && num < 103) ? 50.5f : 55.5f);
			num++;
			graphics.FillRectangle(brush, num2, 2f * num3, num3, num5 * num3);
			num2 += num3;
		}
		num2 = num3 * 3f;
		graphics.DrawString(Code[0].ToString(), font, Brushes.Black, new RectangleF(num2, 51f * num3, num4 * num3, 9f * num3));
		num2 += num3 * 11f;
		string text6 = Code.Substring(1, 6);
		for (int k = 0; k < text6.Length; k++)
		{
			graphics.DrawString(text6[k].ToString(), font, Brushes.Black, new RectangleF(num2, 51.5f * num3, num4 * num3, 9f * num3));
			num2 += num3 * 7f;
		}
		num2 += num3 * 5f;
		string text7 = Code.Substring(7);
		for (int l = 0; l < text7.Length; l++)
		{
			graphics.DrawString(text7[l].ToString(), font, Brushes.Black, new RectangleF(num2, 51.5f * num3, num4 * num3, 9f * num3));
			num2 += num3 * 7f;
		}
		return bitmap;
	}

	public char CheckDigit(string Code)
	{
		char c = '0';
		int num = 0;
		int num2 = 0;
		string text = Code.Substring(0, 12);
		foreach (char c2 in text)
		{
			int num3 = ((num++ % 2 == 0) ? 1 : 3);
			num2 += (c2 - 48) * num3;
		}
		return (char)(c + (ushort)((10 - num2 % 10) % 10));
	}
}
