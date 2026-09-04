using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using ElectronikSistem;
using stk500v1;

namespace stk500;

public class stk500v1 : Constants_v1
{
	private const byte SWITCH_SPEED = 4;

	private byte NotResponse = 0;

	private byte Speed = 0;

	private int[] Speeds = new int[5] { 57600, 38400, 19200, 14400, 9600 };

	public override event EventHandlerStartDownLoad StartDownLoad;

	public override event EventHandlerResponse Response;

	public override event EventHandlerEndDownLoad EndDownLoad;

	public override event EventHandlerBoardReceived BoardReceived;

	public override event EventHandlerError HandlerError;

	public stk500v1()
	{
		Initialize();
	}

	public stk500v1(BootLoader boot)
	{
		User = boot.User;
		SerialNumberProgram = boot.SerialNumberProgram;
		PartNumber = boot.PartNumber;
		VersionFirmware = boot.VersionFirmware;
		COM.PortName = boot.COM.PortName;
		SpeedDevice = boot.SpeedDevice;
		BoardName = boot.BoardName;
		VersionRequest = boot.VersionRequest;
		Initialize();
	}

	private void Initialize()
	{
		ROW_LEN = 128;
		COM.Encoding = Encoding.GetEncoding("ISO-8859-1");
		DataReceived = COM_DataReceived;
		TimeOUT.Tick += TimeOUT_Tick;
	}

	public override bool UploadStart(string vers)
	{
		int address = 30464;
		Speed = 0;
		NotResponse = 0;
		IsProgramming = false;
		if (Firmware != vers.ToLower() + ".hex" && !LoadFileHex(vers.ToLower()))
		{
			return false;
		}
		string reset;
		bool serialNumber = GetSerialNumber(out reset);
		if (SerialNumberProgram != null)
		{
			string s = SerialNumberProgram.PadRight(128, 'ÿ');
			byte[] bytes = COM.Encoding.GetBytes(s);
			AVR_HEX item = new AVR_HEX(address, bytes, 0, (byte)bytes.Length);
			hex.Add(item);
		}
		WriteCMD.Clear();
		VerifyCMD.Clear();
		ErrorList.Clear();
		LockBit = byte.MaxValue;
		Error = 0;
		NReceive = 0;
		WriteCMD.Enqueue(new STK_GET_PARAMETER(130));
		WriteCMD.Enqueue(new STK_GET_PARAMETER(129));
		WriteCMD.Enqueue(new STK_READ_SIGN());
		WriteCMD.Enqueue(new STK_ENTER_PROGMODE());
		int num = 0;
		if (!Verify)
		{
			foreach (AVR_HEX item2 in hex)
			{
				if (item2.type == 1)
				{
					break;
				}
				WriteCMD.Enqueue(new STK_LOAD_ADDRESS(item2.address));
				WriteCMD.Enqueue(new STK_PROG_PAGE(item2.len, item2.memory, item2.address));
			}
		}
		StartDownLoad(0, WriteCMD.Count);
		foreach (AVR_HEX item3 in hex)
		{
			if (item3.type == 1)
			{
				break;
			}
			VerifyCMD.Enqueue(new STK_LOAD_ADDRESS(item3.address));
			VerifyCMD.Enqueue(new STK_READ_PAGE(item3.address, item3.len));
		}
		if (Protect)
		{
			VerifyCMD.Enqueue(new STK_PROG_LOCK());
		}
		VerifyCMD.Enqueue(new STK_LEAVE_PROGMODE());
		StartDownLoad(1, VerifyCMD.Count);
		if (!COM.IsOpen)
		{
			COM.Open();
		}
		COM.DtrEnable = true;
		COM.RtsEnable = true;
		int num2 = 50;
		Sistem.Delay(num2);
		IsProgramming = true;
		TimeOUT.Enabled = true;
		COM.DtrEnable = false;
		COM.RtsEnable = false;
		return true;
	}

	private void COM_DataReceived(List<byte> buffer)
	{
		string text = Encoding.GetEncoding("ISO-8859-1").GetString(buffer.ToArray());
		try
		{
			if (!IsProgramming)
			{
				if (text.IndexOf("Serial Number: ") > -1 && text.IndexOf("\r\n") > -1)
				{
					int num = text.IndexOf("Serial Number: ");
					int num2 = text.IndexOf("\r\n", num);
					try
					{
						SerialNumberMicro = text.Substring(num + 15, num2 - num - 15);
					}
					catch
					{
					}
					buffer.Clear();
				}
				return;
			}
			if (WriteCMD.Count > 0 || VerifyCMD.Count > 0)
			{
				byte[] array = null;
				string text2 = "Start: ";
				if (buffer.Count < Len)
				{
					return;
				}
				string text3 = COM.Encoding.GetString(buffer.ToArray());
				if (base.obj is STK_READ_SIGN)
				{
					Address = Address;
				}
				TimeOUT.Start();
				if (buffer[buffer.Count - 1] == Constants_v1.STK_OK)
				{
					NotResponse = 0;
					TimeOUT.Stop();
					if (WriteCMD.Count > 0)
					{
						text2 = "Write ";
						Response(base.obj, 0);
						WriteCMD.Dequeue();
						if (!(base.obj is STK_PROG_PAGE) && base.obj is STK_READ_LOCK && (buffer[1] & 8) == 0)
						{
							LockBit = 247;
							VerifyCMD.Clear();
							VerifyCMD.Enqueue(new STK_READ_LOCK());
							VerifyCMD.Enqueue(new STK_LEAVE_PROGMODE());
						}
						if (WriteCMD.Count > 0)
						{
							Send(WriteCMD.Peek());
						}
						else
						{
							StartDownLoad(1, VerifyCMD.Count);
							Send(VerifyCMD.Peek());
						}
					}
					else if (VerifyCMD.Count > 0)
					{
						text2 = "Verify ";
						if (base.obj is STK_READ_PAGE)
						{
							array = new byte[buffer.Count - 2];
							System.Buffer.BlockCopy(buffer.ToArray(), 1, array, 0, buffer.Count - 2);
							foreach (AVR_HEX item in hex)
							{
								if (Address == item.address)
								{
									if (item.memory.SequenceEqual(array))
									{
										Error = 0;
										Response(base.obj, 1);
										VerifyCMD.Dequeue();
									}
									else
									{
										Error++;
										ErrorList.Add(text2 + "VERIFICATION FAILED[" + Address.ToString("X4") + "]");
									}
								}
							}
						}
						else if (base.obj is STK_PROG_LOCK)
						{
							Response(base.obj, 1);
							VerifyCMD.Dequeue();
						}
						else
						{
							Response(base.obj, 1);
							VerifyCMD.Dequeue();
						}
						if (VerifyCMD.Count > 0)
						{
							Send(VerifyCMD.Peek());
						}
						else
						{
							Error = 0;
							Result = 0;
							Buffer.Clear();
							COM.BaudRate = SpeedDevice;
						}
					}
				}
			}
			else
			{
				string board = GetBoard(buffer);
				if (board != null)
				{
					base.obj = null;
					BoardReceived(board);
					EndDownLoad(Result);
					IsProgramming = false;
				}
				else if (base.obj != null)
				{
					Sistem.Delay(300.0);
					GetVer();
				}
			}
			if (Error > 5)
			{
				WriteCMD.Clear();
				VerifyCMD.Clear();
				HandlerError(ErrorList[ErrorList.Count - 1]);
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show("buffer.Count=" + buffer.Count + "   " + COM.Encoding.GetString(buffer.ToArray()) + "\r\n\r\n" + ex.Message, "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	private void Send(MESSAGE_CMD cmd)
	{
		TimeOUT.Stop();
		Buffer.Clear();
		if (COM.BaudRate != 115200)
		{
			if (cmd is STK_READ_LOCK)
			{
				Response(obj, 0);
				WriteCMD.Dequeue();
				cmd = ((WriteCMD.Count <= 0) ? VerifyCMD.Peek() : WriteCMD.Peek());
			}
			if (cmd is STK_PROG_LOCK)
			{
				Response(obj, 1);
				VerifyCMD.Dequeue();
				cmd = VerifyCMD.Peek();
			}
		}
		if (NotResponse++ > 25 && NotResponse % 4 == 0)
		{
			NotResponse = 0;
			TimeOUT.Enabled = false;
			if (!(VerifyCMD.ToList()[VerifyCMD.Count - 2] is STK_PROG_LOCK) || !Protect || COM.BaudRate != 115200 || MessageBox.Show("Protection not available.\r\nUpdate the bootloader.\r\n\r\nContinue without protection?", "Error", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1) == DialogResult.Yes)
			{
				if (Speed == Speeds.Length)
				{
					HandlerError("The board is not responding.");
					return;
				}
				COM.Close();
				COM.BaudRate = Speeds[Speed++];
				Sistem.Delay(1550.0);
				COM.Open();
				TimeOUT.Enabled = true;
			}
			else if (NotResponse == 4)
			{
				Result = 1;
				WriteCMD.Clear();
				VerifyCMD.Clear();
				GetVer();
				return;
			}
		}
		obj = cmd;
		Len = cmd.responselen;
		if (cmd is STK_READ_PAGE)
		{
			Address = cmd.address;
		}
		for (int i = 0; i < cmd.CMD.Length; i++)
		{
			COM.Write(cmd.CMD, i, 1);
		}
		TimeOUT.Start();
	}

	private void TimeOUT_Tick(object sender, EventArgs e)
	{
		if (WriteCMD.Count > 0)
		{
			Send(WriteCMD.Peek());
		}
		else
		{
			Time_OUT();
		}
	}
}
