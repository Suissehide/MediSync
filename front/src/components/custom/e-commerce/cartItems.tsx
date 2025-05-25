import { Minus, Plus, Trash } from 'lucide-react'
import { Button } from '../../ui/button.tsx'
import { Card } from '../../ui/card.tsx'
import { useCartStore } from '../../../store/useCartStore.ts'
import type { FakeStoreProducts as Product } from '../../../types/products.ts'

interface cartItemProps {
  item: Product
}

export default function CartItems({ item }: cartItemProps) {
  const removeItem = useCartStore((state) => state.removeFromCart)
  const increaseQuantity = useCartStore((state) => state.incrementQuantity)
  const decreaseQuantity = useCartStore((state) => state.decrementQuantity)

  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <img
          src={item.image}
          alt={item.title}
          width={100}
          height={100}
          className="object-contain h-16 w-16"
        />
        <h3 className="text-xl font-semibold flex flex-col gap-1">
          <span>{item.title}</span>
          <span className="text-lg font-medium">${item.price}</span>
        </h3>
      </div>
      <div className="flex justify-between items-center text-md font-medium">
        <span className="flex items-center gap-1">
          Quantity:
          <Button
            className="w-5 h-5 p-0"
            onClick={() => decreaseQuantity(item)}
            disabled={item.quantity === 1}
          >
            <Minus className="w-3 h-3" />
          </Button>
          {item.quantity}
          <Button
            className="w-5 h-5 p-0"
            onClick={() => increaseQuantity(item)}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </span>
        <Button onClick={() => removeItem(item)}>
          <Trash className="h-5 w-5" />
        </Button>
      </div>
    </Card>
  )
}
