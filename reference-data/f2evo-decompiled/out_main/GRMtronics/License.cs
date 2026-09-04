using System;

namespace GRMtronics;

public class License
{
	public struct FIELDS
	{
		public string User;

		public DateTime Scadenza;

		public ushort Mask;
	}

	public static string EncoderField(FIELDS fields)
	{
		DateTime dateTime = new DateTime(1968, 11, 17);
		string data = fields.User + ";" + fields.Scadenza.AddTicks(-dateTime.Ticks).ToString("ddhhMMmmyyyy") + ";" + fields.Mask;
		return Encoder(data);
	}

	private static string Encoder(string data)
	{
		string text = "";
		byte b = 65;
		string text2 = text;
		byte b2 = b;
		text = text2 + b2;
		foreach (char c in data)
		{
			string text3 = (c - "'"[0]).ToString();
			text += (c - "'"[0]).ToString().PadLeft(2, '0');
		}
		char[] array = text.ToCharArray();
		char[] array2 = new char[array.Length];
		array2[0] = array[0];
		array2[1] = array[1];
		int num = 0;
		for (byte b3 = 0; b3 < array.Length - 2; b3++)
		{
			num = (b3 + b) % (array.Length - 2);
			array2[2 + num] = array[b3 + 2];
		}
		return new string(array2);
	}

	private static string Decoder(string data)
	{
		char[] array = data.Substring(2).ToCharArray();
		string text = "";
		char[] array2 = new char[array.Length];
		byte b = byte.Parse(data.Substring(0, 2));
		int num = 0;
		for (byte b2 = 0; b2 < array.Length; b2++)
		{
			num = (b2 + b) % array.Length;
			array2[b2] = array[num];
		}
		string text2 = new string(array2);
		for (byte b3 = 0; b3 < text2.Length; b3 += 2)
		{
			sbyte b4 = sbyte.Parse(text2.Substring(b3, 2));
			text += (char)(b4 + "'"[0]);
		}
		return text;
	}

	public static bool DecoderField(string code, out FIELDS fields)
	{
		try
		{
			DateTime dateTime = new DateTime(1968, 11, 17);
			FIELDS fIELDS = default(FIELDS);
			string text = Decoder(code);
			string[] array = text.Split(';');
			fIELDS.User = array[0];
			string s = array[1].Substring(0, 2) + "-" + array[1].Substring(4, 2) + "-" + array[1].Substring(8, 4);
			fIELDS.Scadenza = DateTime.Parse(s).AddTicks(dateTime.Ticks);
			ushort.TryParse(array[2], out fIELDS.Mask);
			fields = fIELDS;
			return true;
		}
		catch
		{
			fields = default(FIELDS);
			return false;
		}
	}
}
