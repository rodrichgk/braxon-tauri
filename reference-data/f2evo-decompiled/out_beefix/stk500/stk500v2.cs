using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using ElectronikSistem;
using UpdateFirmware;
using stk500v2;

namespace stk500;

public class stk500v2 : Constants_v2
{
	private byte NSend = 0;

	public MESSAGE Message;

	public byte[] MessageBody;

	protected byte CheckSum;

	private MESSAGE_CMD CMD_DATA;

	public override event EventHandlerStartDownLoad StartDownLoad;

	public override event EventHandlerResponse Response;

	public override event EventHandlerEndDownLoad EndDownLoad;

	public override event EventHandlerBoardReceived BoardReceived;

	public override event EventHandlerError HandlerError;

	public stk500v2()
	{
		Initialize();
	}

	public stk500v2(BootLoader boot)
	{
		User = boot.User;
		SerialNumberProgram = boot.SerialNumberProgram;
		PartNumber = boot.PartNumber;
		VersionFirmware = boot.VersionFirmware;
		COM.PortName = boot.COM.PortName;
		SpeedDevice = boot.SpeedDevice;
		BoardName = boot.BoardName;
		VersionRequest = boot.VersionRequest;
		IsBEEFIX = boot.IsBEEFIX;
		Initialize();
	}

	private void Initialize()
	{
		ROW_LEN = 64;
		Message.MessageStart = Constants_v2.MESSAGE_START;
		Message.MessageSize1 = 0;
		Message.TOKEN = Constants_v2.TOKEN;
		COM.Encoding = Encoding.GetEncoding("ISO-8859-1");
		DataReceived = COM_DataReceived;
		TimeOUT.Tick += TimeOUT_Tick;
		TimeService.Tick += TimeService_Tick;
		TimeService.Enabled = true;
	}

	private byte[] Serialize(byte N)
	{
		List<byte> list = new List<byte>();
		Message.SeguenceNumber = N;
		Message.MessageSize2 = (byte)MessageBody.Length;
		byte[] collection = Sistem.Serialize(Message);
		list.AddRange(collection);
		list.AddRange(MessageBody);
		CheckSum = 0;
		foreach (byte item in list)
		{
			CheckSum ^= item;
		}
		list.Add(CheckSum);
		return list.ToArray();
	}

	public override bool UploadStart(string vers)
	{
		byte b = 64;
		int address = 126720;
		if (!COM.IsOpen)
		{
			COM.Open();
		}
		IsProgramming = false;
		string reset;
		bool serialNumber = GetSerialNumber(out reset);
		if (Firmware != vers.ToLower() + ".hex" && !LoadFileHex(vers))
		{
			return false;
		}
		if (SerialNumberProgram != null)
		{
			string s = SerialNumberProgram.PadRight(32, 'ÿ');
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
		WriteCMD.Enqueue(new CMD_SIGN_ON());
		WriteCMD.Enqueue(new CMD_GET_PARAMETER(Constants_v2.PARAM_BUILD_NUMBER_LOW));
		WriteCMD.Enqueue(new CMD_GET_PARAMETER(Constants_v2.PARAM_BUILD_NUMBER_HIGH));
		WriteCMD.Enqueue(new CMD_GET_PARAMETER(Constants_v2.PARAM_HW_VER));
		WriteCMD.Enqueue(new CMD_GET_PARAMETER(Constants_v2.PARAM_SW_MAJOR));
		WriteCMD.Enqueue(new CMD_GET_PARAMETER(Constants_v2.PARAM_SW_MINOR));
		WriteCMD.Enqueue(new CMD_ENTER_PROGMODE_ISP());
		WriteCMD.Enqueue(new CMD_READ_LOCK_ISP());
		if (!Verify)
		{
			foreach (AVR_HEX item2 in hex)
			{
				if (item2.type == 1)
				{
					break;
				}
				WriteCMD.Enqueue(new CMD_LOAD_ADDRESS(item2.addr, item2.address));
				WriteCMD.Enqueue(new CMD_PROGRAM_FLASH_ISP(item2.len, item2.memory, item2.address));
			}
		}
		StartDownLoad(0, WriteCMD.Count);
		foreach (AVR_HEX item3 in hex)
		{
			if (item3.type == 1)
			{
				break;
			}
			VerifyCMD.Enqueue(new CMD_LOAD_ADDRESS(item3.addr, item3.address));
			VerifyCMD.Enqueue(new CMD_READ_FLASH_ISP(item3.len, item3.address));
		}
		if (Protect)
		{
			VerifyCMD.Enqueue(new CMD_PROGRAM_LOCK_ISP(247));
		}
		VerifyCMD.Enqueue(new CMD_LEAVE_PROGMODE_ISP());
		string s2 = Firmware.Replace("firmware-ver", "").Replace(".hex", "").Replace(".", ",");
		double num = double.Parse(s2, MainForm.Culture);
		bool flag = false;
		bool flag2 = false;
		if (num >= 2.1 && (PartNumber.IndexOf("Hydraulics") > -1 || PartNumber == "TEST" || PartNumber == "BEEFIX") && Sistem.GetDeviceUSB(COM.PortName) != "Arduino Mega 2560")
		{
			flag = true;
		}
		else
		{
			flag2 = true;
		}
		COM.RtsEnable = flag ^ Inverter;
		COM.DtrEnable = flag2 ^ Inverter;
		if (VersionFirmware == "Firmware-ver1")
		{
			VersionRequest = "\u0002ver\0".ToCharArray();
		}
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
				byte b = 0;
				string text2 = "Start: ";
				if (buffer.Count < Len)
				{
					return;
				}
				byte b2 = buffer.GetRange(Len - 1, 1)[0];
				for (byte b3 = 0; b3 < Len - 1; b3++)
				{
					b ^= buffer[b3];
				}
				if (b == b2)
				{
					if (buffer.GetRange(6, 1)[0] == Constants_v2.STATUS_CMD_OK)
					{
						TimeOUT.Stop();
						if (buffer.GetRange(5, 1)[0] == Constants_v2.CMD_READ_LOCK_ISP)
						{
							LockBit = buffer.GetRange(7, 1)[0];
							if ((LockBit & 8) == 0)
							{
								VerifyCMD.Clear();
								VerifyCMD.Enqueue(new CMD_READ_LOCK_ISP());
								VerifyCMD.Enqueue(new CMD_LEAVE_PROGMODE_ISP());
							}
						}
						if (WriteCMD.Count > 0)
						{
							text2 = "Write ";
							WriteCMD.Dequeue();
							Error = 0;
							if (WriteCMD.Count > 0)
							{
								Response(base.obj, 0);
								if (WriteCMD.Peek() is CMD_PROGRAM_FLASH_ISP)
								{
									CMD_PROGRAM_FLASH_ISP cMD_PROGRAM_FLASH_ISP = (CMD_PROGRAM_FLASH_ISP)WriteCMD.Peek();
									if (Address != cMD_PROGRAM_FLASH_ISP.address)
									{
										Error++;
										if (Error >= 6)
										{
											ErrorList.Add(text2 + "ADDRESS FAILED[" + Address.ToString("X4") + "]");
										}
									}
								}
								Send(WriteCMD.Peek());
							}
							else
							{
								Response(base.obj, 0);
								StartDownLoad(1, VerifyCMD.Count);
								Send(VerifyCMD.Peek());
							}
						}
						else if (VerifyCMD.Count > 0)
						{
							text2 = "Verify ";
							if (buffer.GetRange(5, 1)[0] == Constants_v2.CMD_READ_FLASH_ISP)
							{
								array = new byte[Len - 9];
								System.Buffer.BlockCopy(buffer.ToArray(), 7, array, 0, Len - 9);
								bool flag = false;
								foreach (AVR_HEX item in hex)
								{
									if (Address == item.address)
									{
										flag = true;
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
										break;
									}
								}
								if (!flag)
								{
									MessageBox.Show("Indirizzo non trovato.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
								}
							}
							else if (buffer.GetRange(5, 1)[0] == Constants_v2.CMD_LEAVE_PROGMODE_ISP)
							{
								Response(base.obj, 1);
								VerifyCMD.Dequeue();
							}
							else if (buffer.GetRange(5, 1)[0] == Constants_v2.CMD_READ_LOCK_ISP)
							{
								Response(base.obj, 1);
								VerifyCMD.Dequeue();
							}
							else if (buffer.GetRange(5, 1)[0] == Constants_v2.CMD_PROGRAM_LOCK_ISP)
							{
								Response(base.obj, 1);
								VerifyCMD.Dequeue();
							}
							else if (buffer.GetRange(5, 1)[0] == Constants_v2.CMD_LOAD_ADDRESS)
							{
								Response(base.obj, 1);
								VerifyCMD.Dequeue();
							}
							if (VerifyCMD.Count > 0)
							{
								if (VerifyCMD.Peek() is CMD_READ_FLASH_ISP)
								{
									CMD_READ_FLASH_ISP cMD_READ_FLASH_ISP = (CMD_READ_FLASH_ISP)VerifyCMD.Peek();
									if (Address != cMD_READ_FLASH_ISP.address)
									{
										Error = 16;
										ErrorList.Add(text2 + "ADDRESS_ERROR[" + Address.ToString("X4") + "]");
									}
								}
								Send(VerifyCMD.Peek());
							}
							else
							{
								Error = 0;
								Result = 0;
								Buffer.Clear();
							}
						}
						NReceive++;
					}
					else
					{
						Error++;
						ErrorList.Add(text2 + "STATUS_CMD_FAILED[" + Address.ToString("X4") + "]");
						if (NReceive > 0)
						{
							if (WriteCMD.Count > 0)
							{
								Send(WriteCMD.Peek());
							}
							else if (VerifyCMD.Count > 0)
							{
								Send(VerifyCMD.Peek());
							}
						}
					}
				}
				else
				{
					Error++;
					ErrorList.Add(text2 + "Checksum NOT OK[" + Address.ToString("X4") + "]");
				}
			}
			else
			{
				string board = GetBoard(buffer);
				if (board != null)
				{
					BoardReceived(board);
					COM.DtrEnable = true;
					COM.RtsEnable = true;
					Sistem.Delay(50.0);
					COM.DtrEnable = false;
					COM.RtsEnable = false;
					EndDownLoad(Result);
					IsProgramming = false;
				}
				else
				{
					Sistem.Delay(100.0);
					COM.Write("\u0002\u0002\u0002".ToCharArray(), 0, 3);
					Sistem.Delay(200.0);
					GetVer();
				}
			}
			if (Error > 5)
			{
				AbortUpdate();
			}
		}
		catch (Exception ex)
		{
			Verify = true;
			WriteCMD.Clear();
			VerifyCMD.Clear();
			IsProgramming = false;
			MessageBox.Show("buffer.Count=" + buffer.Count + "   " + COM.Encoding.GetString(buffer.ToArray()) + "\r\n\r\n" + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	private void AbortUpdate()
	{
		Verify = true;
		WriteCMD.Clear();
		VerifyCMD.Clear();
		IsProgramming = false;
		COM.DtrEnable = true;
		COM.RtsEnable = true;
		Sistem.Delay(50.0);
		COM.DtrEnable = false;
		COM.RtsEnable = false;
		if (ErrorList.Count > 0)
		{
			HandlerError(ErrorList[ErrorList.Count - 1]);
		}
		else
		{
			HandlerError("Unexpected Error!!!");
		}
	}

	private void Send(MESSAGE_CMD cmd)
	{
		TimeOUT.Stop();
		Buffer.Clear();
		CMD_DATA = cmd;
		Len = cmd.responselen;
		MessageBody = cmd.CMD;
		byte[] array = Serialize(NSend++);
		if (cmd is CMD_LOAD_ADDRESS)
		{
			Address = cmd.address;
		}
		if (WriteCMD.Count == 1)
		{
			Address = Address;
		}
		COM.Write(array, 0, array.Length);
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

	private void TimeService_Tick(object sender, EventArgs e)
	{
	}
}
