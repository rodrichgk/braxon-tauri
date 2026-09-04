using System;

namespace SC_F2_EVO;

public class Coda1
{
	private char[] buffer;

	private int size;

	private int top = 0;

	private int pos = 0;

	public int Count
	{
		get
		{
			int num = 0;
			int num2 = top;
			int num3 = pos;
			while (num2 != num3)
			{
				num++;
				num3++;
				num3 %= size;
			}
			return num;
		}
	}

	public Coda1(int size)
	{
		this.size = size;
		buffer = new char[size];
	}

	public void Enqueue(char car)
	{
		buffer[top++] = car;
		top %= size;
		if (top == pos)
		{
			throw new Exception("Queue full!!!");
		}
	}

	public char Dequeue()
	{
		if (top == pos)
		{
			throw new Exception("Queue empty!!!");
		}
		char result = buffer[pos++];
		pos %= size;
		return result;
	}

	public char Peek()
	{
		return buffer[pos];
	}
}
