using System.Collections.Generic;
using stk500;

namespace stk500v1;

public class STK_PROG_PAGE : MESSAGE_CMD
{
	public STK_PROG_PAGE(byte len, byte[] data, int address)
	{
		base.address = address;
		responselen = 2;
		List<byte> list = new List<byte>();
		list.Add(Constants_v1.STK_PROG_PAGE);
		list.Add(0);
		list.Add(len);
		list.Add(0);
		list.AddRange(data);
		list.Add(Constants_v1.CRC_EOP);
		CMD = list.ToArray();
	}
}
