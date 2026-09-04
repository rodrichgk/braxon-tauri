using System.Collections.Generic;
using stk500;

namespace stk500v2;

public class CMD_PROGRAM_FLASH_ISP : MESSAGE_CMD
{
	public CMD_PROGRAM_FLASH_ISP(byte len, byte[] data, int address)
	{
		base.address = address;
		responselen = 8;
		List<byte> list = new List<byte>();
		list.Add(Constants_v2.CMD_PROGRAM_FLASH_ISP);
		list.Add(0);
		list.Add(len);
		list.AddRange(new byte[7]);
		list.AddRange(data);
		CMD = list.ToArray();
	}
}
