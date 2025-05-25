import { Button } from '../../ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../ui/card.tsx'
import { useCartStore } from '../../../store/useCartStore.ts'
import type { FakeStoreProducts } from '../../../types/products.ts'

interface productProps {
  product: FakeStoreProducts
}

export default function ProductCard({ product }: productProps) {
  const addToCart = useCartStore((state) => state.addToCart)

  const handleClick = () => {
    addToCart(product)
    // toast({
    //   variant: 'success',
    //   title: 'Added to cart',
    // })
  }

  return (
    <Card className="w-fit flex flex-col justify-between">
      <CardContent className="p-2">
        <img
          src={product.image}
          alt={product.title}
          width={100}
          height={100}
          className="object-contain w-full h-40"
        />
        <CardHeader>
          <CardTitle>{product.title}</CardTitle>
          <CardDescription>
            {product.description.slice(0, 76).concat('...')}
          </CardDescription>
        </CardHeader>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <span className="font-bold text-xl">${product.price}</span>
        <Button onClick={() => handleClick()}>Add to cart</Button>
      </CardFooter>
    </Card>
  )
}
