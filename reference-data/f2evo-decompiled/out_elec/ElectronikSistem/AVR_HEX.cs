using System;

namespace ElectronikSistem;

public class AVR_HEX
{
	public int address;

	public byte len;

	public byte[] addr = new byte[4];

	public byte type;

	public byte[] memory;

	public AVR_HEX(int address, byte[] memory, byte type, byte len)
	{
		this.type = type;
		this.len = len;
		this.memory = new byte[len];
		this.address = address;
		int num = address >> 1;
		addr[2] = (byte)(num / 256);
		addr[3] = (byte)(num % 256);
		Buffer.BlockCopy(memory, 0, this.memory, 0, len);
	}

	public AVR_HEX(byte[] row)
	{
		type = row[3];
		len = row[0];
		memory = new byte[len];
		address = (row[1] << 8) | row[2];
		int num = address >> 1;
		addr[2] = (byte)(num / 256);
		addr[3] = (byte)(num % 256);
		Buffer.BlockCopy(row, 4, memory, 0, len);
	}
}
